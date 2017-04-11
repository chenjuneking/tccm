#!/usr/bin/env node

/*
  Usage:
    tccm config --set-origin=http://example.com    # set the origin server
    cd to/the/path/of/your/component
    tccm version 0.0.1                             # update the version
    tccm publish                                   # publish the component
    tccm get lazyload-0.0.1                        # download the component
*/

var log = console.log;
var fs = require('fs');
var stdin = process.stdin;
var stdout = process.stdout;
var _p = require('path');
var archiver = require('archiver');
var fstream = require('fstream');
var superagent = require('superagent');

var cwd = process.cwd();
var args = parseArgs(process.argv);
var cmd = args.cmd;

var configPath = _p.join(__dirname, 'config.json');

function parseArgs (args) {
  var _o = {}, item;
  args = args.slice(2);
  _o.cmd = args[0];
  args = args.slice(1);

  for (var i = 0, len = args.length; i < len; i++) {
    item = args[i];
    if (item.indexOf('--') == 0 && item.indexOf('=') > 0) {
      item = item.split('=');
      switch (item[0]) {
        case '--set-origin':
          _o.origin = item[1];
          break;
        case '--set-user':
          _o.user = item[1];
          break;
        case '--set-email':
          _o.email = item[1];
          break;
        default:
          break
      }
    } else if (/^\d+\.\d+\.\d+$/.test(item)) {
      _o.setVersionTo = item;
    } else if (/^[a-zA-Z0-9_\-@#\.]+$/.test(item)) {
      _o.get = item;
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
  log('  tccm get [<component>] - Download the component');
  log('Options:');
  log('  --help or -h      Print commands and options.');
  log('  --version or -v   Print current versions.');
}
Tccm.prototype.config = function () {
  var data = fs.existsSync(configPath) ? require(configPath) : {};
  if (args.origin) {
    data.origin = args.origin;
  } else if (args.user) {
    data.user = args.user;
  } else if (args.email) {
    data.email = args.email;
  } else {
    return log('Error: Invalid configuration')
  }
  fs.writeFile(configPath, JSON.stringify(data), function (err) {
    if (err) throw err;
    log(' + Setting success!');
  });
}
Tccm.prototype.updateVersion = function () {
  var config = checkConfig();
  if (config) {
    var setVersionTo = args.setVersionTo, info;
    if (!setVersionTo) return log('Error: Missing version or invalid version, please run: \'tccm version <version string> to specify the version you want to apply to this component.');
    var info = {
      version: setVersionTo,
      author: config.user,
      email: config.email,
      cwd: cwd,
      dirname: cwd.split('/').slice(-1)[0]
    }
    fs.writeFile(_p.join(cwd, 'info.json'), JSON.stringify(info), function (err) {
      if (err) throw err;
      log(' + update version success!');
    });
  }
}
Tccm.prototype.publish = function () {
  var config = checkConfig();
  if (config) {
    var host = config.origin, info = fs.existsSync(_p.join(cwd, 'info.json')) ? require(_p.join(cwd, 'info.json')) : null;
    if (!info || info.cwd != cwd) {
      return log('Error: Can\'t publish before setting version, please run \' tccm version x.x.xx \' to set the version.')
    }
    var zipFilePath = _p.join('/tmp', info.dirname + '@' + info.version + '.zip');
    var output = fs.createWriteStream(zipFilePath);
    var archive = archiver('zip', { store: true });
    output.on('close', function () {
      // zip finish, now upload to the server
      superagent
        .post(host + '/upload?author=' + info.author + '&email=' + info.email)
        .attach('file', zipFilePath)
        .end(function (err, res) {
          if (err) return log('Error: an error occurred while file upload: ' + err);
          fs.unlinkSync(zipFilePath);
          log(' + file successfully publish!');
        })
    });
    output.on('error', function (err) {
      log('An error occurred: ', err);
    });
    archive.pipe(output);
    archive.directory('./');
    archive.finalize();
    /*
    var tarFilePath = _p.join('/tmp', info.dirname + '-' + info.version + '.tar');
    var ws = fs.createWriteStream(tarFilePath);
    ws.on('finish', function () {
      superagent
        .post(host + '/upload?author=' + info.author + '&email=' + info.email)
        .attach('file', tarFilePath)
        .end(function (err, res) {
          if (err) return log(err);
          fs.unlinkSync(tarFilePath);
          log(' - component successfully uploaded!');
        });
    })
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
    */
  }
}
Tccm.prototype.get = function () {
  var path = _p.join(cwd, args.get + '.zip'), host;
  try {
    host = require(_p.join(__dirname, 'config.json')).origin;
  } catch (e) {
    return log('Error: Can\'t find config.json, please run \'tccm config --set-origin=[<host>] \' before download components.');
  }

  superagent
    .get(host + '/components/' + args.get)
    .end(function (err, res) {
      if (err) return log('An error accurred: ', err)
      if (res.body.code === 0) {
        var ws = fs.createWriteStream(path);
        ws.on('finish', function () {
          log('+ Get ' + args.get + ' successfully!')
          // Issues: unzip file in the current directory
          // no need for this moments.

        //   var extractor = tar.Extract({ path: _p.join(cwd) })
        //     .on('error', function (err) {
        //       log('An error accurred: ', err);
        //     })
        //     .on('end', function () {
        //       fs.unlinkSync(path);
        //       log(' + component - ' + args.get);
        //     });

        //   fs.createReadStream(path)
        //     .on('error', function (err) {
        //       log('An error accurred: ', err);
        //     })
        //     .pipe(extractor);
        });
        superagent.get(host + res.body.data).pipe(ws)
      } else {
        log(res.body.msg)
      }
    })

  // superagent
  //   .get(host + '/components/' + args.get + '.zip')
  //   .pipe(ws);
}

function checkConfig () {
  var errorMsg = {
    user: 'Error: Can\'t find user, please run: \'tccm config --set-user=username\' to specify a user',
    email: 'Error: Can\'t find email, please run: \'tccm config --set-email=email@address\' to specify the email',
    origin: 'Error: Missing origin, please run: \'tccm config --set-origin=http://example.com\' to specify the origin host.'
  }
  var config = fs.existsSync(configPath) ? require(configPath) : {};
  if (!config.origin) {
    log(errorMsg['origin']);
    return false;
  }
  if (!config.user) {
    log(errorMsg['user']);
    return false;
  }
  if (!config.email) {
    log(errorMsg['email']);
    return false;
  }
  return config;
}

var tccm = new Tccm;

var Do = {
  'version': tccm.updateVersion,
  'publish': tccm.publish,
  'config': tccm.config,
  'get': tccm.get,
  '-h': tccm.getHelpInfo,
  '--help': tccm.getHelpInfo,
  '-v': tccm.getVersion,
  '--version': tccm.getVersion
}

Do[cmd] && typeof Do[cmd] == 'function' ? Do[cmd].call(global) : Do['-h'].call(global);
