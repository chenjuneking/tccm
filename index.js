#!/usr/bin/env node

/*
  Usage:
    tccm config --set-origin=http://example.com    # set the origin server
    cd to/the/path/of/your/component
    tccm version 0.0.1                             # update the version
    tccm publish                                   # publish the component
*/

var log = console.log;
var fs = require('fs');
var stdin = process.stdin;
var stdout = process.stdout;
var _p = require('path');
var tar = require('tar');
var fstream = require('fstream');
var superagent = require('superagent');

var cwd = process.cwd();
var args = parseArgs(process.argv);
var cmd = args.cmd;

function parseArgs (args) {
  var _o = {}, item;
  args = args.slice(2);
  _o.cmd = args[0];
  args = args.slice(1);

  for (var i = 0, len = args.length; i < len; i++) {
    item = args[i];
    if (item.indexOf('--') == 0 && item.indexOf('=') > 0) {
      item = item.split('=');
      if (item[0] == '--set-origin') _o.origin = item[1];
    } else if (/^\d+\.\d+\.\d+$/.test(item)) {
      _o.setVersionTo = item;
    }
  }
  return _o;
}

var Tccm = function () {}
Tccm.prototype.getVersion = function () {
  var version = require(_p.join(__dirname, '/package.json')).version;
  log(version);
}
Tccm.prototype.getHelpInfo = function () {
  log('Commands:');
  log('  tccm config --set-origin=http://example.com - Set the origin host.');
  log('  tccm version [<version>] - Update the component\'s version.');
  log('  tccm publish - Publish the component.');
  log('Options:');
  log('  --help or -h      Print commands and options.');
  log('  --version or -v   Print current versions.');
}
Tccm.prototype.config = function () {
  var origin = args.origin;
  if (!origin) return log('Error: Missing origin, please run: \'tmmc config --set-origin=http://example.com\' to specify the origin host.');
  fs.writeFile(_p.join(__dirname, 'config.json'), JSON.stringify({
    origin: origin
  }), function (err) {
    if (err) throw err;
    log(' + set origin host to ' + origin + ' success!');
  });
}
Tccm.prototype.updateVersion = function () {
  var setVersionTo = args.setVersionTo, info;
  if (!setVersionTo) return log('Error: Missing version or invalid version, please run: \'tccm version <version string> to specify the version you want to apply to this component.');
  info = require(_p.join(cwd, 'info.json'));
  info.version = setVersionTo;
  fs.writeFile(_p.join(cwd, 'info.json'), JSON.stringify(info), function (err) {
    if (err) throw err;
    log(' + update version success!');
  });
}
Tccm.prototype.publish = function () {
  var host = require(_p.join(__dirname, 'config.json')).origin;
  var info = require(_p.join(cwd, 'info.json'));
  var tarFilePath = _p.join('/tmp', info.name + '-' + info.version + '.tar');
  var ws = fs.createWriteStream(tarFilePath);

  function onError (err) {
    log('An error occurred: ', err);
  }
  function onEnd () {
    log('Finished!');
  }
  var packer = tar.Pack({ noProprietary: true })
    .on('error', onError)
    .on('end', onEnd);

  fstream.Reader({ path: _p.resolve(cwd), type: 'Directory' })
    .on('error', onError)
    .pipe(packer)
    .pipe(ws);

  superagent
    .post(host + '/upload')
    .set('Content-Type', 'multipart/form-data')
    .attach('file', tarFilePath)
    .end(function (err, res) {
      if (err) return log(err);
      log(' - component successfully uploaded!');
    });
}

var tccm = new Tccm;

var Do = {
  'version': tccm.updateVersion,
  'publish': tccm.publish,
  'config': tccm.config,
  '-h': tccm.getHelpInfo,
  '--help': tccm.getHelpInfo,
  '-v': tccm.getVersion,
  '--version': tccm.getVersion
}

Do[cmd] && typeof Do[cmd] == 'function' ? Do[cmd].call(global) : Do['-h'].call(global);
