var express = require('express')
var bodyParser = require('body-parser')
var multer = require('multer')
var app = express()
var uuid = require('node-uuid')
var db = require('./db')

app.use(bodyParser.json())
app.use('/images', express.static(__dirname + '/images'))

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000')
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

  db.exists('students', id, function (err, exists) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!exists) {
      res.status(404).send('Not Found')
    } else {

      db.destroy('students', id, function (err, record) {
        if (err) {
          res.status(500).send('Internal Error')
        } else {
          res.status(204).send()
        }
      })
    }
  })
})

app.get('/students/:id/donations', function (req, res) {
  res.json([{
    id: 'c',
    from: 'Larry',
    amount: 600
  }, {
    id: 'd',
    from: 'Jane',
    amount: 300
  }])
})

var server = app.listen(8080, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('Listening at %s:%d', host, port)
})
