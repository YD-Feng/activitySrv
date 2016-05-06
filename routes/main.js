var _ = require('underscore'),//引入 underscore 模块
    activityMod = require('./modules/activityMod'),//引入 menu 模块
    config = {
        get: {
        },
        post: {
            '/activity/update': activityMod.update
        }
    };//路由配置



module.exports = function (app) {

    //分析路由配置对象，逐一处理
    _.each(config, function (subConfig, method) {

        _.each(subConfig, function (func, url) {

            app[method](url, func);

        });

    });

};
