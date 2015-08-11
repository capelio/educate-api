var Joi = require('joi')

module.exports = {
  student: Joi.object().keys({
    id: Joi.string(),
    createdAt: Joi.string(),
    funded: Joi.boolean(),
    goal: Joi.number().integer(),
    name: Joi.string(),
    profileImage: Joi.string(),
    story: Joi.string()
  })
}
