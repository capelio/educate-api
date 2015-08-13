var levelup = require('levelup')
var db = levelup('../db', { valueEncoding: 'json' })

var operations = []

function renameStudentId () {
  var options = {
    gt: 'donations:',
    lt: 'donations@'
  }

  db.createReadStream(options)
    .on('data', function (donation) {
      if (donation.value.studentId) {
        donation.value.causeId = donation.value.studentId
        delete donation.value.studentId

        operations.push({
          type: 'put',
          key: donation.key,
          value: donation.value
        })
      }
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

renameStudentId()
