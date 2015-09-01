var fs = require('fs')

var config = require('toml').parse(fs.readFileSync('./config.toml'))
var db = require(config.db.path)

var nextNaturalKeyFunctions = {
  causes: function (callback) {
    db.get('naturalKeys', 'causes', function (err, record) {
      var nextNaturalKey

      if (err) {
        callback(err)
      } else if (!record) {
        nextNaturalKey = 1
        callback(null, nextNaturalKey)
      } else {
        nextNaturalKey = ++record.naturalKey
        callback(null, nextNaturalKey)
      }
    })
  }
}

module.exports = {
  next: function (collection, callback) {
    if (!nextNaturalKeyFunctions.hasOwnProperty(collection)) {
      callback(new Error('Collection ' + collection + ' does not have a naturalKey function'))
    } else {
      nextNaturalKeyFunctions[collection](function (err, naturalKey) {
        if (err) {
          callback(err)
        } else {
          callback(null, naturalKey)
        }
      })
    }
  },

  commit: function (collection, naturalKey) {
    var record = {
      id: 'causes',
      naturalKey: naturalKey
    }

    db.put('naturalKeys', record, function (err) {
      // TODO: handle error during persistence refactor
      if (err) console.error(err)
    })
  }
}
