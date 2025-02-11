#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var _1 = require(".");
var minimist_1 = __importDefault(require("minimist"));
var nodeArgs = [];
var unknown = [];
var devArgs = process.argv.slice(2, 100);
var tsNodeFlags = {
    boolean: [
        'scope',
        'emit',
        'files',
        'pretty',
        'transpile-only',
        'prefer-ts-exts',
        'prefer-ts',
        'log-error',
        'skip-project',
        'skip-ignore',
        'compiler-host',
        'script-mode',
    ],
    string: [
        'compiler',
        'project',
        'ignore',
        'ignore-diagnostics',
        'compiler-options',
    ],
};
var tsNodeAlias = {
    'transpile-only': 'T',
    'compiler-host': 'H',
    ignore: 'I',
    'ignore-diagnostics': 'D',
    'compiler-options': 'O',
    compiler: 'C',
    project: 'P',
    'script-mode': 's',
};
var devFlags = {
    boolean: [
        'deps',
        'all-deps',
        'dedupe',
        'fork',
        'exec-check',
        'debug',
        'poll',
        'respawn',
        'notify',
        'tree-kill',
        'clear',
        'cls',
        'exit-child',
        'error-recompile',
        'quiet',
        'rs',
    ],
    string: [
        'dir',
        'deps-level',
        'compile-timeout',
        'ignore-watch',
        'interval',
        'debounce',
        'watch',
        'cache-directory',
    ],
};
var opts = (0, minimist_1.default)(devArgs, {
    stopEarly: true,
    boolean: __spreadArray(__spreadArray([], devFlags.boolean, true), tsNodeFlags.boolean, true),
    string: __spreadArray(__spreadArray([], devFlags.string, true), tsNodeFlags.string, true),
    alias: __assign(__assign({}, tsNodeAlias), { 'prefer-ts-exts': 'prefer-ts' }),
    default: {
        fork: true,
    },
    unknown: function (arg) {
        unknown.push(arg);
        return true;
    },
});
var script = opts._[0];
var scriptArgs = opts._.slice(1);
opts.priorNodeArgs = [];
unknown.forEach(function (arg) {
    if (arg === script || nodeArgs.indexOf(arg) >= 0)
        return;
    var argName = arg.replace(/^-+/, '');
    // fix this
    var argOpts = opts[argName];
    var argValues = Array.isArray(argOpts) ? argOpts : [argOpts];
    argValues.forEach(function (argValue) {
        if ((arg === '-r' || arg === '--require') && argValue === 'esm') {
            opts.priorNodeArgs.push(arg, argValue);
            return false;
        }
        nodeArgs.push(arg);
        if (typeof argValue === 'string') {
            nodeArgs.push(argValue);
        }
    });
});
if (!script) {
    // eslint-disable-next-line no-console
    console.log('ts-node-dev: no script to run provided');
    // eslint-disable-next-line no-console
    console.log('Usage: ts-node-dev [options] script [arguments]\n');
    process.exit(1);
}
(0, _1.runDev)(script, scriptArgs, nodeArgs, opts);
