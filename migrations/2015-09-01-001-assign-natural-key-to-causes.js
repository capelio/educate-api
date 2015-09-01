var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var ncp = require('ncp')
var moment = require('moment')
var async = require('async')
var _ = require('lodash')

var config = require('toml').parse(fs.readFileSync('./config.toml'))
var db = require(path.join('../', config.db.path))
var naturalKeys = require('../natural-keys.js')

var causes = []
var updateFunctions = []

var options = {
  gt: 'causes:',
  lt: 'causes@'
}

function backupDatabase (callback) {
  var destination = './backups/db/' + moment.utc().toISOString()

  mkdirp(destination, function (err) {
    if (err) {
      console.error('failed making backup directory', err)
    } else {
      ncp('./db', destination, function (err) {
        if (err) {
          console.error('failed backing up database', err)
          callback(err)
        } else {
          callback(null)
        }
      })
    }
  })
}

function collectCauses (callback) {
  db.levelup.createReadStream(options)
    .on('data', function (cause) {
      causes.push(cause)
    })
    .on('error', function (err) {
      console.error('failed to read from leveldb readStream', err)
      callback(err)
    })
    .on('end', function () {
      callback(null)
    })
}

function createUpdateFunctions (callback) {
  _.each(causes, function (cause) {
    updateFunctions.push(function (innerCallback) {
      naturalKeys.next('causes', function (err, naturalKey) {
        if (err) {
          console.error('failed to get next causes natural key', err)
          innerCallback(err)
        } else {
          cause.value.naturalKey = naturalKey

          db.put('causes', cause.value, function (err, record) {
            if (err) {
              console.error('failed to save updated cause', err)
              innerCallback(err)
            } else {
              naturalKeys.commit('causes', naturalKey)
              innerCallback(null)
            }
          })
        }
      })
    })
  })

  callback(null)
}

function runUpdateFunctions (callback) {
  async.series(updateFunctions, function (err) {
    if (err) {
      callback(err)
    } else {
      callback()
    }
  })
}

async.series([
  backupDatabase,
  collectCauses,
  createUpdateFunctions,
  runUpdateFunctions
])
