var express = require('express')
var bodyParser = require('body-parser')
var multer = require('multer')
var uuid = require('node-uuid')
var _ = require('lodash')
var moment = require('moment')
var fs = require('fs')
var Joi = require('joi')

var config = require('toml').parse(fs.readFileSync('./config.toml'))
var db = require(config.db.path)
var emailer = require('./email')(config.mailgun)
var querySchemas = require('./query-schemas')

var stripe = require('stripe')(config.stripe.secretKey)

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

app.post('/causes', authenticateRequest, function (req, res) {
  var cause = req.body
  delete cause.donations

  db.put('causes', cause, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.get('/causes', function (req, res) {
  sanitizeQueryUsingSchema(req.query, querySchemas.cause, function (err, query) {
    if (err && err.name === 'ValidationError') {
      res.status(400).json(err)
    } else if (err) {
      res.status(500).send('Internal Error')
    } else {
      /*
       * A cause's "funded" property does not exist as a property on
       * its JSON record. We determine a cause's funded status by
       * checking whether or not it has received enough donations to
       * reach its funding goal.
       *
       * Before querying the database, we check whether or not we will
       * need to filter on funded status. If so, we set that knowledge
       * aside for future use and delete the funded property from the
       * query we send to the database. Otherwise, as no causes
       * have a funded property, the query wouldn't return any records.
       */
      var filterByFunded = _.isBoolean(query.funded)

      if (filterByFunded) {
        var fundedFilter = query.funded
        delete query.funded
      }

      db.query('causes', query, function (err, records) {
        if (err) {
          res.status(500).send('Internal Error')
        } else {
          // Only get cause donations if there are cause records
          if (!records.length) {
            res.status(200).json([])
          } else {
            var done = _.after(records.length, function () {
              if (filterByFunded) {
                var filteredCauses = _.filter(records, function (cause) {
                  return (fundedFilter ? causeIsFunded(cause) : causeIsNotFunded(cause))
                })

                res.status(200).json(filteredCauses)
              } else {
                res.status(200).json(records)
              }
            })

            _.forEach(records, function (cause) {
              db.query('donations', {causeId: cause.id}, function (err, records) {
                if (err) {
                  console.error(err)
                } else if (records) {
                  cause.donations = records
                }

                done()
              })
            })
          }
        }
      })
    }
  })
})

function causeIsFunded (cause) {
  var donated = _.sum(cause.donations, 'amount')
  return donated >= cause.goal
}

function causeIsNotFunded (cause) {
  var donated = _.sum(cause.donations, 'amount')
  return donated < cause.goal
}

app.get('/causes/:id', function (req, res) {
  var id = req.params.id

  db.get('causes', id, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!record) {
      res.status(404).send('Not Found')
    } else {
      res.json(record)
    }
  })
})

app.put('/causes/:id', authenticateRequest, function (req, res) {
  var id = req.params.id
  var cause = req.body
  delete cause.donations

  db.exists('causes', id, function (err, exists) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!exists) {
      res.status(404).send('Not Found')
    } else {

      db.put('causes', cause, function (err, record) {
        if (err) {
          res.status(500).send('Internal Error')
        } else {
          res.status(201).json(record)
        }
      })
    }
  })
})

app.delete('/causes/:id', authenticateRequest, function (req, res) {
  var id = req.params.id

  db.get('causes', id, function (err, cause) {
    if (err) {
      res.status(500).send('Internal Error')
    } else if (!cause) {
      res.status(404).send('Not Found')
    } else {
      var profileImage = cause.profileImage

      db.destroy('causes', id, function (err) {
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

app.post('/causes/:causeId/donations', function (req, res) {
  // TODO: make sure cause exists first or return 404

  var donation = req.body
  donation.causeId = req.params.causeId

  db.put('donations', donation, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.get('/causes/:causeId/donations', function (req, res) {
  // TODO: make sure cause exists first or return 404

  var causeId = req.params.causeId
  var query = {
    causeId: causeId
  }

  db.query('donations', query, function (err, records) {
    if (err) {
      res.status(500).send('Internal Errors')
    } else {
      res.json(records)
    }
  })
})

app.get('/causes/:causeId/donations/:id', function (req, res) {
  // TODO: make sure cause exists first or return 404
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

app.put('/causes/:causeId/donations/:id', function (req, res) {
  // TODO: make sure cause exists first or return 404
  var donation = req.body

  db.put('donations', donation, function (err, record) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(201).json(record)
    }
  })
})

app.delete('/causes/:causeId/donations/:id', function (req, res) {
  // TODO: make sure cause exists first or return 404
  var id = req.params.id

  db.destroy('donations', id, function (err) {
    if (err) {
      res.status(500).send('Internal Error')
    } else {
      res.status(204).send('No Content')
    }
  })
})

app.post('/causes/:id/donate/card', function (req, res) {
  var causeId = req.params.id

  var amount = req.body.amount
  var donor = req.body.donor
  var email = req.body.email
  var token = req.body.token

  var amountInPennies = Math.floor(amount * 100)
  var chargeDescription = 'Empower Nepal donation'

  stripe.charges.create({
    amount: amountInPennies,
    currency: 'usd',
    source: token,
    description: chargeDescription
  }, function (err, charge) {
    if (err) {
      // TODO: handle ALL error cases (charge failed, etc)
      // TODO: log error
      res.status(500).send('Internal Error')
    } else {
      var chargeId = charge.id
      var donationDescription = 'Credit card donation'

      var donation = {
        chargeId: chargeId,
        causeId: causeId,
        amount: amount,
        description: donationDescription,
        donor: donor,
        email: email
      }

      var date = moment.utc().format('dddd, MMMM Do, YYYY')
      var prettyAmount = '$' + amount

      var emailDetails = {
        from: config.email.from,
        to: email,
        subject: 'Thank you for your donation! Here is your receipt.',
        text: '' +
          donor + ',' +
          '\n\n' +
          'Thank you for your donation!' +
          '\n\n' +
          'Date: ' + date + '\n' +
          'Amount: ' + prettyAmount +
          '\n\n' +
          'If you need to contact us, simply reply to this email and we will be back in touch as soon as possible.' +
          '\n\n' +
          ' - The Lift Up Nepal Team' +
          '\n\n' +
          'Cause ID: ' + causeId + '\n' +
          'Charge ID: ' + chargeId
      }

      emailer.send(emailDetails, function (err) {
        if (err) {
          // TODO: log the fact that we were able to charge the card
          // but were unable to deliver an email receipt
          // TODO: rollback the charge?
        }
      })

      db.put('charges', charge, function (err, record) {
        if (err) {
          // TODO: handle this correctly, as in this instance
          // the charge was successfully processed, but we were
          // unable to save the charge's details (we have no record)
          // TODO: log the fact that we were able to charge the card
          // but were unable to save a record of the charge
          // TODO: rollback the charge?
          res.status(500).send('Internal Error')
        } else {
          db.put('donations', donation, function (err, record) {
            if (err) {
              // TODO: log the fact that we were able to charge the card
              // but were unable to create a donation for the charge
              res.status(500).send('Internal Error')
            } else {
              res.status(201).json(record)
            }
          })
        }
      })
    }
  })
})

function sanitizeQueryUsingSchema (query, schema, callback) {
  Joi.validate(query, schema, function (err, value) {
    if (err) return callback(err)

    callback(null, value)
  })
}

var server = app.listen(config.server.port, function () {
  var host = server.address().address
  var port = server.address().port

  console.log('Listening at %s:%d', host, port)
})
