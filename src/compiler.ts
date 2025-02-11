import * as tsNode from 'ts-node'
import * as tsNodeUtils from './util'

import fs from 'fs'
import path from 'path'
import os from 'os'
import mkdirp from 'mkdirp'
import rimraf from 'rimraf'
import { resolveSync } from 'tsconfig'
import { Options } from './bin'
import { getCompiledPath } from './get-compiled-path'
import { Log } from './log'
import { getCwd } from './get-cwd'

const fixPath = (p: string) => p.replace(/\\/g, '/').replace(/\$/g, '$$$$')

const sourceMapSupportPath = require.resolve('source-map-support')

const compileExtensions = ['.ts', '.tsx']
const cwd = process.cwd()
const compilationInstanceStamp = Math.random().toString().slice(2)

const originalJsHandler = require.extensions['.js']

export type CompileParams = {
  code?: string
  compile: string
  compiledPath: string
}

export const makeCompiler = (
  options: Options,
  {
    log,
    restart,
  }: {
    log: Log
    restart: (fileName: string) => void
  }
) => {
  let _errorCompileTimeout: ReturnType<typeof setTimeout>
  let allowJs = false

  const project = options['project']
  const tsConfigPath =
    resolveSync(cwd, typeof project === 'string' ? project : undefined) || ''

  const compiledPathsHash: Record<string, true> = {}

  const tmpDir = options['cache-directory']
    ? path.resolve(options['cache-directory'])
    : fs.mkdtempSync(path.join(os.tmpdir(), '.ts-node'))

  const writeChildHookFile = (options: Options) => {
    const compileTimeout = parseInt(options['compile-timeout'])

    const getIgnoreVal = (ignore: string) => {
      const ignoreVal =
        !ignore || ignore === 'false'
          ? 'false'
          : '[' +
            ignore
              .split(/,/)
              .map((i) => i.trim())
              .map((ignore) => 'new RegExp("' + ignore + '")')
              .join(', ') +
            ']'
      return ignoreVal
    }

    const varDecl = (name: string, value: string) => `var ${name} = '${value}'`

    const replacements: string[][] = [
      compileTimeout ? ['10000', compileTimeout.toString()] : null,
      allowJs ? ['allowJs = false', 'allowJs = true'] : null,
      options['prefer-ts-exts']
        ? ['preferTs = false', 'preferTs = true']
        : null,
      options['exec-check'] ? ['execCheck = false', 'execCheck = true'] : null,
      options['exit-child'] ? ['exitChild = false', 'exitChild = true'] : null,
      options['ignore'] !== undefined
        ? [
            'var ignore = [/node_modules/]',
            'var ignore = ' + getIgnoreVal(options['ignore']),
          ]
        : null,
      [
        varDecl('compilationId', ''),
        varDecl('compilationId', getCompilationId()),
      ],
      [varDecl('compiledDir', ''), varDecl('compiledDir', getCompiledDir())],
      [
        './get-compiled-path',
        fixPath(path.join(__dirname, 'get-compiled-path')),
      ],
      [
        varDecl('readyFile', ''),
        varDecl('readyFile', getCompilerReadyFilePath()),
      ],
      [
        varDecl('sourceMapSupportPath', ''),
        varDecl('sourceMapSupportPath', fixPath(sourceMapSupportPath)),
      ],
      [
        varDecl('libPath', ''),
        varDecl('libPath', __dirname.replace(/\\/g, '\\\\')),
      ],
      ['__dirname', '"' + fixPath(__dirname) + '"'],
    ]
      .filter((_) => !!_)
      .map((_) => _!)

    const fileText = fs.readFileSync(
      path.join(__dirname, 'child-require-hook.js'),
      'utf-8'
    )

    const fileData = replacements.reduce((text, [what, to]) => {
      return text.replace(what, to)
    }, fileText)

    fs.writeFileSync(getChildHookPath(), fileData)
  }

  const init = () => {
    registerTsNode()

    /* clean up compiled on each new init*/
    rimraf.sync(getCompiledDir())
    createCompiledDir()

    // check if `allowJs` compiler option enable
    // (.js handler was changed while ts-node registration)
    allowJs = require.extensions['.js'] !== originalJsHandler
    if (allowJs) {
      compileExtensions.push('.js', '.jsx')
    }

    writeChildHookFile(options)
  }

  const getCompilationId = () => {
    return compilationInstanceStamp
  }
  const createCompiledDir = () => {
    const compiledDir = getCompiledDir()
    if (!fs.existsSync(compiledDir)) {
      mkdirp.sync(getCompiledDir())
    }
  }
  const getCompiledDir = () => {
    return path.join(tmpDir, 'compiled').replace(/\\/g, '/')
  }
  const getCompileReqFilePath = () => {
    return path.join(getCompiledDir(), getCompilationId() + '.req')
  }
  const getCompilerReadyFilePath = () => {
    return path
      .join(os.tmpdir(), 'ts-node-dev-ready-' + compilationInstanceStamp)
      .replace(/\\/g, '/')
  }

  const getChildHookPath = () => {
    return path
      .join(os.tmpdir(), 'ts-node-dev-hook-' + compilationInstanceStamp + '.js')
      .replace(/\\/g, '/')
  }
  const writeReadyFile = () => {
    fs.writeFileSync(getCompilerReadyFilePath(), '')
  }

  const clearErrorCompile = () => {
    clearTimeout(_errorCompileTimeout)
  }
  const registerTsNode = () => {
    Object.keys(compiledPathsHash).forEach((key) => {
      delete compiledPathsHash[key]
    })
    // revert back original handler extensions
    // in case of re-registering
    ;['.js', '.jsx', '.ts', '.tsx'].forEach(function (ext) {
      require.extensions[ext] = originalJsHandler
    })

    const scriptPath = options._.length
      ? path.resolve(cwd, options._[0])
      : undefined

    const DEFAULTS = (tsNode as any).DEFAULTS;
    const _utils = (tsNodeUtils as any);

    tsNode.register({
      // --dir does not work (it gives a boolean only) so we only check for script-mode
      dir: getCwd(options['dir'], options['script-mode'], scriptPath),
      scope: options['scope'] || DEFAULTS.scope,
      emit: options['emit'] || DEFAULTS.emit,
      files: options['files'] || DEFAULTS.files,
      pretty: options['pretty'] || DEFAULTS.pretty,
      transpileOnly: options['transpile-only'] || DEFAULTS.transpileOnly,
      ignore: options['ignore']
        ? _utils.split(options['ignore'])
        : DEFAULTS.ignore,
      preferTsExts: options['prefer-ts-exts'] || DEFAULTS.preferTsExts,
      logError: options['log-error'] || DEFAULTS.logError,
      project: options['project'],
      skipProject: options['skip-project'],
      skipIgnore: options['skip-ignore'],
      compiler: options['compiler'] || DEFAULTS.compiler,
      compilerHost: options['compiler-host'] || DEFAULTS.compilerHost,
      ignoreDiagnostics: options['ignore-diagnostics']
        ? _utils.split(options['ignore-diagnostics'])
        : DEFAULTS.ignoreDiagnostics,
      compilerOptions: _utils.parse(options['compiler-options']),
    })
  }

  const compiler = {
    tsConfigPath,
    init,
    getCompileReqFilePath,
    getChildHookPath,
    writeReadyFile,
    clearErrorCompile,
    compileChanged: function (fileName: string) {
      const ext = path.extname(fileName)
      if (compileExtensions.indexOf(ext) < 0) return
      try {
        const code = fs.readFileSync(fileName, 'utf-8')
        compiler.compile({
          code: code,
          compile: fileName,
          compiledPath: getCompiledPath(code, fileName, getCompiledDir()),
        })
      } catch (e) {
        console.error(e)
      }
    },
    compile: function (params: CompileParams) {
      const compiledPath = params.compiledPath

      // Prevent occasional duplicate compilation requests
      if (compiledPathsHash[compiledPath]) {
        return
      }
      compiledPathsHash[compiledPath] = true

      function writeCompiled(code: string, fileName?: string) {
        fs.writeFile(compiledPath, code, (err) => {
          err && log.error(err)
          fs.writeFile(compiledPath + '.done', '', (err) => {
            err && log.error(err)
          })
        })
      }
      if (fs.existsSync(compiledPath)) {
        return
      }

      const starTime = new Date().getTime()

      const fileName = params.compile
      const m: any = {
        _compile: writeCompiled,
      }
      const _compile = () => {
        const ext = path.extname(fileName)
        const extHandler = require.extensions[ext]!

        extHandler(m, fileName)

        log.debug(
          fileName,
          'compiled in',
          new Date().getTime() - starTime,
          'ms'
        )
      }
      try {
        _compile()
      } catch (e) {
        console.error('Compilation error in', fileName)
        const errorCode =
          'throw ' + 'new Error(' + JSON.stringify( (e as any).message) + ')' + ';'
        writeCompiled(errorCode)

        // reinitialize ts-node compilation to clean up state after error
        // without timeout in causes cases error not be printed out
        setTimeout(() => {
          registerTsNode()
        }, 0)

        if (!options['error-recompile']) {
          return
        }
        const timeoutMs =
          parseInt(process.env.TS_NODE_DEV_ERROR_RECOMPILE_TIMEOUT || '0') ||
          5000
        const errorHandler = () => {
          clearTimeout(_errorCompileTimeout)
          _errorCompileTimeout = setTimeout(() => {
            try {
              _compile()
              restart(fileName)
            } catch (e) {
              registerTsNode()
              errorHandler()
            }
          }, timeoutMs)
        }

        errorHandler()
      }
    },
  }

  return compiler
}
