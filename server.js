var express = require('express')
var bodyParser = require('body-parser')
var multer = require('multer')
var uuid = require('node-uuid')
var fs = require('fs')
var config = require('toml').parse(fs.readFileSync('./config.toml'))
var db = require('./db')

var app = express()
app.use(bodyParser.json())
app.use('/images', express.static(__dirname + '/images'))

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', config.server.allowOrigin)
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE')
  res.header('Vary', 'Accept-Encoding, Origin')
  next()
})

function renameFile (fieldname, filename, req, res) {
  res.locals.filename = uuid.v4()
  return res.locals.filename
}

app.post('/uploads/images', [ multer({ dest: './images', rename: renameFile }) ], function (req, res) {
  res.status(201).json({filename: res.locals.filename})
})

app.post('/students', function (req, res) {
  var student = req.body

  db.put('students', student, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.get('/students', function (req, res) {
  db.getAll('students', function (err, records) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.json(records)
    }
  })
})

app.get('/students/:id', function (req, res) {
  var id = req.params.id

  db.get('students', id, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!record) {
      res.status(404).send('Not Found')
    } else {
      res.json(record)
    }
  })
})

app.put('/students/:id', function (req, res) {
  var id = req.params.id
  var student = req.body

  db.exists('students', id, function (err, exists) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!exists) {
      res.status(404).send('Not Found')
    } else {

      db.put('students', student, function (err, record) {
        if (err) {
          res.status(500).send('Internal Error')
        } else {
          res.status(201).json(record)
        }
      })
    }
  })
})

app.delete('/students/:id', function (req, res) {
  var id = req.params.id

  db.get('students', id, function (err, student) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!student) {
      res.status(404).send('Not Found')
    } else {
      var profileImage = student.profileImage

      db.destroy('students', id, function (err, record) {
        if (err) {
          res.status(500).send('Internal Error')
        } else {
          res.status(204).send('No Content')

          if (profileImage !== 'default-profile-image.png') {
            var path = './images/' + profileImage
            fs.unlink(path, function (err) {
              if (err) {
                // TODO: track images we've failed to delete so we can cleanup later
                console.error('Failed deleting profile image', err)
              }
            })
          }
        }
      })
    }
  })
})

var server = app.listen(config.server.port, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('Listening at %s:%d', host, port)
})
