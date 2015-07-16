var levelup = require('levelup')
var _ = require('lodash')
var uuid = require('node-uuid')
var moment = require('moment')

var db = levelup('./db', {
  valueEncoding: 'json'
})

module.exports = {
  put: function (collection, record, callback) {
    var isNew = !!record.id

    record.id = isNew ? uuid.v4() : record.id

    if (isNew) {
      record.createdAt = moment.utc().toISOString()
    } else {
      record.updatedAt = moment.utc().toISOString()
    }

    var key = buildKey(collection, record.id)

    db.put(key, record, function (err) {
      if (err) {
        callback(err)
      } else {
        callback(null, record)
      }
    })
  },

  get: function (collection, id, callback) {
    var key = buildKey(collection, id)

    db.get(key, function (err, record) {
      if (err && err.notFound) {
        callback(null, null)
      } else if (err) {
        callback(err)
      } else {
        callback(null, record)
      }
    })
  },

  getAll: function (collection, callback) {
    var records = []

    var opts = {
      gt: collection + collectionSeparator(),
      lt: collection + collectionTerminator()
    }

    db.createValueStream(opts)
      .on('data', function (record) {
        records.push(record)
      })
      .on('error', function (err) {
        callback(err)
      })
      .on('end', function () {
        callback(null, records)
      })
  },

  destroy: function (collection, id, callback) {
    var key = buildKey(collection, id)

    db.del(key, function (err) {
      if (err) {
        callback(err)
      } else {
        callback(null)
      }
    })
  },

  exists: function (collection, id, callback) {
    this.get(collection, id, function (err, record) {
      if (err) {
        callback(err)
      } else if (!record) {
        callback(null, false)
      } else {
        callback(null, true)
      }
    })
  },

  query: function (collection, query, callback) {
    var records = []

    var opts = {
      gt: collection + collectionSeparator(),
      lt: collection + collectionTerminator()
    }

    db.createValueStream(opts)
      .on('data', function (record) {
        if (_.isMatch(record, query)) {
          records.push(record)
        }
      })
      .on('error', function (err) {
        callback(err)
      })
      .on('end', function () {
        callback(null, records)
      })
  }
}

function buildKey (collection, id) {
  return collection + collectionSeparator() + id
}

function collectionSeparator () {
  return ':'
}

function collectionTerminator () {
  return '@'
}
