/*!
 * app-updater
 * Copyright(c) 2017 Daguang Li
 * MIT Licensed
 */

'use strict'

const pm2 = require('pm2')
    , extract = require('extract-zip')
    , fs = require('fs')
    , del = require('del')
    , async = require('neo-async')
    , debug = require('debug')('node-app-updater:main')
    , { exec } = require('child_process')
    , path = require('path')

module.exports = function (opts, topcb) {
    if (!opts) {
        throw new Error('Parameters are required.')
    }
    if (typeof opts !== 'object') {
        throw new TypeError('Options must be of type object.')
    }
    if (!opts.appPath) {
        throw new Error('appPath must be provided.')
    }
    if (!path.isAbsolute(opts.appPath)) {
        throw new TypeError('appPath must be absolute')
    }
    if (!opts.buildPath) {
        throw new Error('buildPath must be provided.')
    }
    if (!path.isAbsolute(opts.buildPath)) {
        throw new TypeError('buildPath must be absolute')
    }
    if (!opts.processName) {
        throw new Error('processName must be provided.')
    }
    if (typeof opts.processName !== 'string') {
        throw new TypeError('processName must be absolute')
    }

    async.series([
        function (callback) {
            debug('Start clean folder...')
            del([opts.appPath + '/**', '!' + opts.appPath, '!' + opts.appPath + '/node_modules',
            '!' + opts.appPath + '/node_modules/**/*'], { force: true }).then(function (path) {
                debug('Finished clean prod folder')
                callback(null, null)
            })
        },
        function (callback) {
            debug('unzipping...')
            extract(opts.buildPath, { dir: opts.appPath }, function (err) {
                if (err) {
                    debug('unzip failed')
                    callback(err)
                } else {
                    debug('Finished unzip')
                    callback(null, null)
                }
            })
        },
        function (callback) {
            debug('npm install...')
            process.chdir(opts.appPath)
            exec('npm i --production', function (err, stdout, stderr) {
                if (err) {
                    debug(err)
                    callback(err)
                } else {
                    debug('finished npm install:' + stdout)
                    callback(null, stdout)
                }
            })
        },
        function (callback) {
            pm2.connect(function (err) {
                if (err) {
                    debug(err);
                    callback(err);
                }
                pm2.describe(opts.processName, function (err, proc) {
                    if (proc.length === 0) {
                        pm2.start({
                            name: opts.processName,
                            script: opts.script || 'index.js',
                            instances: 1
                        }, function (err, apps) {
                            pm2.disconnect();
                            if (err) {
                                debug('Failed to start process ' + opts.processName)
                                callback(err)
                            } else {
                                debug('New process ' + opts.processName + ' successfully started!')
                                callback(null, null)
                            }
                        });
                    } else {
                        pm2.restart(opts.processName, function (err, proc) {
                            pm2.disconnect();
                            if (err) {
                                debug('Failed to reload process ' + opts.processName)
                                callback(err)
                            } else {
                                debug('Process ' + opts.processName + ' successfully reloaded!')
                                callback(null, null)
                            }
                        })
                    }
                });

            })
        }
    ], function (err, results) {
        if (err) {
            debug('Error updating software:' + err)
            topcb(err)
        } else {
            debug('Software update completed successfully!')
            topcb(null, null)
        }
    }
    );
}
