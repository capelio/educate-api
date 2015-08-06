function Email (options) {
  if (!options.domain) throw new Error('You must provide a "domain" options property when creating an instance of the email module')
  if (!options.apiKey) throw new Error('You must provide a "apiKey" options property when creating an instance of the email module')

  this.mailgun = require('mailgun-js')(options)
  this.options = options
}

Email.prototype.send = function (email, callback) {
  this.mailgun.messages().send(email, function (err, body) {
    if (err) {
      callback(err)
    } else {
      callback(null)
    }
  })
}

module.exports = function (options) {
  return new Email(options)
}
