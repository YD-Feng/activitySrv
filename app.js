var express = require('express'),
    path = require('path'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    bodyParser = require('body-parser'),
    routes = require('./routes/main'),
    settings = require('./dataSrv/settings'),

    //生成一个 express 实例
    app = express();



//指定 web 应用的标题栏小图标的路径为：/static/favicon.ico
app.use(favicon(path.join(__dirname, 'static', 'favicon.ico')));
//加载日志中间件
app.use(logger('dev'));
//加载解析 json 的中间件
app.use(bodyParser.json());
//加载解析 urlencoded 请求体的中间件
app.use(bodyParser.urlencoded({ extended: false }));
//设置 static 文件夹为存放静态文件的目录
app.use(express.static(path.join(__dirname, 'static')));

//配置路由
routes(app);

//捕获404错误，并转发到错误处理器
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});


//错误处理器
if (app.get('env') === 'development') {
    //开发环境下的错误处理器，将错误信息渲染 error 模版并显示到浏览器中
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.send('error', {
            code: err.status || 500,
            msg: err.message,
            error: err
        });
    });
}

app.use(function(err, req, res, next) {
    //生产环境下的错误处理器，不会将错误信息泄露给用户
    res.status(err.status || 500);
    res.send('error', {
        code: err.status || 500,
        msg: err.message
    });
});

//导出 app 实例供其他模块调用
module.exports = app;
