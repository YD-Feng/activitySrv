var settings = require('./settings'),
    redis = require('redis'),
    client = redis.createClient(settings.redisPort, settings.redisHost, {
        password: 'douyou2015'
    });

module.exports = client;
