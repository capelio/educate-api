var express = require('express')
var bodyParser = require('body-parser')
var multer = require('multer')
var uuid = require('node-uuid')
var _ = require('lodash')
var fs = require('fs')

var config = require('toml').parse(fs.readFileSync('./config.toml'))
var db = require('./db')

var app = express()
app.use(bodyParser.json())
app.use('/images', express.static(__dirname + '/images'))

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', config.server.allowOrigin)
  res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE')
  res.header('Vary', 'Accept-Encoding, Origin')
  next()
})

var tokens = []

function generateToken () {
  return uuid.v4()
}

function addToken (token) {
  tokens.push(token)
}

function removeToken (token) {
  _.remove(tokens, function (t) {
    return t === token
  })
}

function validToken (token) {
  return _.contains(tokens, token)
}

function authenticateRequest (req, res, next) {
  var token = req.get('Authorization')

  if (token && validToken(token)) {
    return next()
  }

  res.status(401).send()
}

function renameFile (fieldname, filename, req, res) {
  res.locals.filename = uuid.v4()
  return res.locals.filename
}

app.post('/signin', function (req, res) {
  var accounts = config.accounts
  var credentials = req.body

  if (!_.findWhere(accounts, credentials)) {
    return res.status(401).send()
  } else {
    var token = generateToken()
    addToken(token)
    res.json({ token: token })
  }
})

app.post('/signout', authenticateRequest, function (req, res) {
  var token = req.body.token

  if (token) {
    removeToken(token)
  }

  res.status(204).send()
})

app.post('/uploads/images', authenticateRequest, [ multer({ dest: './images', rename: renameFile }) ], function (req, res) {
  res.status(201).json({filename: res.locals.filename})
})

app.post('/students', authenticateRequest, function (req, res) {
  var student = req.body

  db.put('students', student, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      delete record.donations
      res.status(201).json(record)
    }
  })
})

app.get('/students', function (req, res) {
  db.getAll('students', function (err, records) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      // Only get student donations if there are student records
      if (!records.length) {
        res.status(200).json([])
      } else {
        var done = _.after(records.length, function () {
          res.status(200).json(records)
        })

        _.forEach(records, function (student) {
          db.query('donations', {studentId: student.id}, function (err, records) {
            if (err) {
              console.error(err)
            } else if (records) {
              student.donations = records
            }

            done()
          })
        })
      }
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

app.put('/students/:id', authenticateRequest, function (req, res) {
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

app.delete('/students/:id', authenticateRequest, function (req, res) {
  var id = req.params.id

  db.get('students', id, function (err, student) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!student) {
      res.status(404).send('Not Found')
    } else {
      var profileImage = student.profileImage

      db.destroy('students', id, function (err) {
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

app.post('/students/:studentId/donations', function (req, res) {
  // TODO: make sure student exists first or return 404

  var donation = req.body
  donation.studentId = req.params.studentId

  db.put('donations', donation, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.get('/students/:studentId/donations', function (req, res) {
  // TODO: make sure student exists first or return 404

  var studentId = req.params.studentId
  var query = {
    studentId: studentId
  }

  db.query('donations', query, function (err, records) {
    if (err) {
      res.status(500).send('Internal Errors')
    } else {
      res.json(records)
    }
  })
})

app.get('/students/:studentId/donations/:id', function (req, res) {
  // TODO: make sure student exists first or return 404
  var id = req.params.id

  db.get('donations', id, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!record) {
      res.status(404).send('Not Found')
    } else {
      res.json(record)
    }
  })
})

app.put('/students/:studentId/donations/:id', function (req, res) {
  // TODO: make sure student exists first or return 404
  var id = req.params.id
  var donation = req.body

  db.put('donations', donation, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.delete('/students/:studentId/donations/:id', function (req, res) {
  // TODO: make sure student exists first or return 404
  var id = req.params.id

  db.destroy('donations', id, function (err) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(204).send('No Content')
    }
  })
})

var server = app.listen(config.server.port, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('Listening at %s:%d', host, port)
})
