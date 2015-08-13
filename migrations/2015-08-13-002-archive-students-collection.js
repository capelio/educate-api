var levelup = require('levelup')
var db = levelup('../db', { valueEncoding: 'json' })

var copyOperations = []
var deleteOperations = []

function archiveStudentsCollection () {
  var options = {
    gt: 'students:',
    lt: 'students@'
  }

  db.createReadStream(options)
    .on('data', function (student) {
      var archiveKey = student.key.replace(/^students:/, 'students-archive:')

      copyOperations.push({
        type: 'put',
        key: archiveKey,
        value: student.value
      })

      deleteOperations.push({
        type: 'del',
        key: student.key
      })
    })
    .on('error', function (err) {
      console.error(err)
    })
    .on('end', function () {
      db.batch(copyOperations, function (err) {
        if (err) {
          console.error(err)
        } else {
          db.batch(deleteOperations, function (err) {
            if (err) console.error(err)
          })
        }
      })
    })
}

archiveStudentsCollection()
