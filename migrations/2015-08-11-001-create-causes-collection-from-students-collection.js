var levelup = require('levelup')
var db = levelup('../db', { valueEncoding: 'json' })

var operations = []

function createCausesCollectionFromStudents () {
  var options = {
    gt: 'students:',
    lt: 'students@'
  }

  db.createReadStream(options)
    .on('data', function (student) {
      var causesKey = student.key.replace(/^students:/, 'causes:')

      operations.push({
        type: 'put',
        key: causesKey,
        value: student.value
      })
    })
    .on('error', function (err) {
      console.error(err)
    })
    .on('end', function () {
      db.batch(operations, function (err) {
        if (err) console.error(err)
      })
    })
}

createCausesCollectionFromStudents()
