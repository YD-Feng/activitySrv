#!/usr/bin/env node
//上面一行表明此文件是 node 可执行文件

//定义全局变量
global.rankingGroup = {};
global.redisClient = require('./dataSrv/redisClient');//引入 redis 客户端模块
global.redisMainKey = {
    ranking: 'RANKING_GROUP',
    treasure: 'ONLINE_TREASURE_GROUPS'
};
global.ws = null;

var app = require('./app'),//引入 app.js 导出的 app 实例
    debug = require('debug')('test:server'),//引入 debug 模块，打印调试日志
    http = require('http'),//引入 http 模块，用以创建 http 服务
    queryString = require('querystring'),//引入 querystring 模块，用以将对象转成post请求数据字符串
    port = process.env.PORT || '3000',//环境变量如果设置了端口号，就用环境变量设置的，否则使用默认值3000
    _ = require('underscore'),//引入 underscore 模块
    server = null,
    userCount = 0,
    requestConfig = {
        host: '127.0.0.1',
        port: 80,
        paths: {
            queryGroups: '/hbiInterface/onlineTreasure/queryGroups',
            increaseJewel: '/hbiInterface/user/increaseJewel',
            getUserInfoC: '/hbiInterface/compereUser/getUserInfo4GameServer',
            getUserInfoP: '/hbiInterface/playerUser/getUserInfo4GameServer',
            queryWinner: '/hbiInterface/onlineTreasure/queryWinner'
        }
    };//发送http请求的相关配置

//redis服务连上后，对全局变量 rankingGroup 进行初始化
redisClient.on('connect', function () {
    getActivityConfig();
    createSrv();

    //服务启动20秒后开始执行活动配置检测轮询
    setTimeout(function () {
        //轮询计时器(如果活动配置信息为空，每10秒重新获取一次活动配置信息，直到成功获取到信息为止)
        var itv = setInterval(function () {
            var count = _.keys(global.rankingGroup).length;
            if (count == 0) {
                getActivityConfig();
            } else {
                clearInterval(itv);
            }
        }, 10000);
    }, 20000);
});

function getActivityConfig () {
    //直接通过后台接口获取活动数据
    sendHttpRequest('POST', requestConfig.paths.queryGroups, null, function (re) {

        if (re && re.returnCode == 0) {
            _.each(re.data, function (item) {
                var list = [];

                _.each(item.list, function (ranking) {
                    if (ranking.status != 1) {
                        list.push(ranking);
                    }
                });

                global.rankingGroup[item.id] = {
                    id: item.id,
                    list: list
                };
            });
        }

    });
}

//创建 http 服务
function createSrv () {
    //设置端口号
    app.set('port', port);

    //创建 http 服务
    server = http.createServer(app);

    //监听端上面设置的口号
    server.listen(port);
    //绑定错误事件处理函数
    server.on('error', onError);
    //绑定监听事件处理函数
    server.on('listening', onListening);

    initWebSocket();
}


//错误事件处理函数
function onError (error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

    //对特定的错误类型做友好的处理
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

//监听事件处理函数
function onListening () {
    var addr = server.address(),
        bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;

    debug('Listening on ' + bind);
}

/*----------------- 长链接业务代码 node-webSocket -----------------*/
function initWebSocket () {
    ws = require('nodejs-websocket').createServer(function (conn) {
        //用户信息登入
        conn.on('text', function (str) {
            var obj = JSON.parse(str);

            switch (obj.method) {
                case 'login':
                    login(obj.data, conn);
                    break;
                case 'get_query_group':
                    getQueryGroup(obj.data, conn);
                    break;
                case 'get_query_ranking':
                    getQueryRanking(obj.data, conn);
                    break;
                case 'indiana':
                    indiana(obj.data, conn);
                    break;
                case 'notice_all':
                    ws.connections.forEach(function (conn) {
                        conn.sendText(JSON.stringify({
                            method: 'notice_all_success'
                        }));
                    });
                    break;
                default:
                    break;
            }
        });

        //连接断开
        conn.on('close', function (code, reason) {
            if (userCount > 0) {
                userCount--
            }
            console.log('有用户断开了与server的连接，当前用户总连接数：' + userCount);
        });

        //出错处理
        conn.on('error', function (err) {
            console.info(err);
        });
    }).listen(3001);

    ws.on('connection', function (conn) {
        userCount++;
        console.log('有用户成功接入server，当前用户总连接数：' + userCount);
    });

    //轮询计时器
    setInterval(function () {
        checkActivity();
    }, 1000);
}

//用户信息登入
function login (obj, conn) {
    conn.curUser = conn.curUser || {};
    conn.curUser.id = obj.user_id;
    conn.curUser.name = obj.user_name;
    conn.curUser.type = obj.user_type;
    conn.curUser.token = obj.token;
    conn.curUser.version = obj.version;
    conn.curUser.os = obj.os;
    conn.curUser.time = obj.time;
    conn.curUser.app_name = obj.app_name;
    conn.curUser.app_version = obj.app_version;
    conn.curUser.city_id = obj.city_id;

    //验证用户
    sendHttpRequest('POST', obj.user_type.toUpperCase() == 'C' ? requestConfig.paths.getUserInfoC : requestConfig.paths.getUserInfoP, {
        userId: conn.curUser.id
    }, function (re) {

        if (re && re.returnCode == 0 && obj.token == re.data.token) {
            //保存用户头像url
            conn.curUser.photo_url = re.data.photoUrl;
            //回传登录成功信息
            conn.sendText(JSON.stringify({
                method: 'login_success'
            }));
        } else {
            //回传登录失败信息
            conn.sendText(JSON.stringify({
                method: 'login_fail',
                data: {
                    msg: re.error
                }
            }));
        }

    });
}

//获取排行榜基础信息列表
function getQueryGroup (obj, conn) {
    var groupId = obj['query_group'],
        result = global.rankingGroup[groupId] ? global.rankingGroup[groupId]['list'] : [];

    _.each(result, function (item) {
        delete item['reward_code'];
    });

    redisClient.hgetall(redisMainKey.ranking, function (err, data) {
        if (err) throw err;

        var curGroupRanking = {};

        if (data) {
            //field 规则 groupId_rankingId_userId 对应为某个用户在某一排行榜的夺宝信息
            _.each(data, function (item, field) {
                //获取该排行榜的所有用户夺宝信息
                if (field.indexOf(groupId + '_') != -1) {
                    var rankingId = field.split('_')[1];
                    if (!curGroupRanking[rankingId]) {
                        curGroupRanking[rankingId] = [];
                    }
                    curGroupRanking[rankingId].push(JSON.parse(item));
                }
            });

            _.each(curGroupRanking, function (item, rankingId) {
                item.sort(function (a, b) {
                    return b['last_time'] - a['last_time'];
                });
            });

            _.each(result, function (item, i) {
                var curRanking = curGroupRanking[item.id];
                item['first_user_id'] = curRanking ? curRanking[0]['user_id'] : '';
                item['first_user_name'] = curRanking ? curRanking[0]['user_name'] : item['winnerName'] || '';
            });
        }

        //回传排行榜基础信息列表
        conn.sendText(JSON.stringify({
            method: 'get_query_group_success',
            data: {
                query_group_result: result
            }
        }));
    });
}

//获取某个排行榜详情
function getQueryRanking (obj, conn) {
    var groupId = obj['query_group'],
        rankingId = obj['query_ranking'],
        curList = global.rankingGroup[groupId] ? global.rankingGroup[groupId]['list'] : [],
        curRanking = _.find(curList, function (item) {
            return item.id == rankingId;
        });

    if (curRanking) {
        delete curRanking.reward_code;

        redisClient.hgetall(redisMainKey.ranking, function (err, data) {
            if (err) throw err;

            var curRankingInfo = [];

            if (data) {
                //field 规则 groupId_rankingId_userId 对应为某个用户在某一排行榜的夺宝信息
                _.each(data, function (item, field) {
                    //获取该排行榜的所有用户夺宝信息
                    if (field.indexOf(groupId + '_' + rankingId + '_') != -1) {
                        curRankingInfo.push(item);
                    }
                });
            }

            curRankingInfo.sort(function (a, b) {
                return b['last_time'] - a['last_time'];
            });

            curRanking.ranking_info = curRankingInfo;

            //回传排行榜详情
            conn.sendText(JSON.stringify({
                method: 'get_query_ranking_success',
                data: {
                    query_ranking_result: curRanking
                }
            }));
        });
    } else {
        //回传排行榜详情
        conn.sendText(JSON.stringify({
            method: 'get_query_ranking_success',
            data: {
                query_ranking_result: null
            }
        }));
    }
}

//夺宝
function indiana (obj, conn) {
    var curRanking;

    if (global.rankingGroup[obj['query_group']]) {
        curRanking = _.find(global.rankingGroup[obj['query_group']]['list'], function (item) {
            return item.id == obj['query_ranking'];
        });
    }

    if (curRanking) {

        if (curRanking.status != 3) {

            if (!conn.curUser) {
                conn.sendText(JSON.stringify({
                    method: 'indiana_fail',
                    data: {
                        msg: '无法获取用户信息，请退出重试'
                    }
                }));

                return;
            }
            //活动没到期，扣减钻石
            sendHttpRequest('POST', requestConfig.paths.increaseJewel, {
                userId: conn.curUser.id,
                amount: obj['amount']
            }, function (re) {

                if (re && re.returnCode == 0) {

                    conn.sendText(JSON.stringify({
                        method: 'indiana_success',
                        data: {
                            jewel: re.data
                        }
                    }));

                    //更新用户排行
                    updateRankingInfo(obj, conn, function (data) {
                        //回传最新排行榜信息(向全体在线用户)
                        ws.connections.forEach(function (conn) {
                            conn.sendText(JSON.stringify({
                                method: 'ranking_info_fresh',
                                data: {
                                    group_id: obj['query_group'],
                                    ranking_id: obj['query_ranking'],
                                    ranking_info: data
                                }
                            }));
                        });
                    });
                } else {
                    conn.sendText(JSON.stringify({
                        method: 'indiana_fail',
                        data: {
                            msg: '扣钻失败'
                        }
                    }));
                }

            });

        } else {
            conn.sendText(JSON.stringify({
                method: 'indiana_fail',
                data: {
                    msg: '活动已过期'
                }
            }));
        }

    } else {
        conn.sendText(JSON.stringify({
            method: 'indiana_fail',
            data: {
                msg: '不存在该活动商品'
            }
        }));
    }
}
/*----------------- 长链接业务代码 node-webSocket end -----------------*/

//发送Http请求
function sendHttpRequest (method, path, params, callBack) {
    var postData = params != null ? queryString.stringify(params) : null,
        options = {
            hostname: requestConfig.host,
            port: requestConfig.port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

    var request = http.request(options, function (response) {
        response.setEncoding('utf8');
        response.on('data', function (re) {
            callBack && callBack(JSON.parse(re));
        });
        response.on('end', function (re) {
            console.log('请求结束');
        });
        response.on('error', function (e) {
            callBack && callBack();
        });
    });

    if (postData) {
        request.write(postData);
    }

    request.end();
}

//更新redis上的排行榜夺宝信息
function updateRankingInfo (obj, conn, callBack) {
    redisClient.hgetall(redisMainKey.ranking, function (err, data) {
        if (err) throw err;

        if (!conn.curUser) {
            conn.sendText(JSON.stringify({
                method: 'indiana_fail',
                data: {
                    msg: '无法获取用户信息，请退出重试'
                }
            }));

            return;
        }

        //field 规则 groupId_rankingId_userId 对应为某个用户在某一排行榜的夺宝信息
        var fieldIndex = obj['query_group'] + '_' + obj['query_ranking'] + '_',
            field = fieldIndex + conn.curUser.id,
            curInfo = data && data[field] ? JSON.parse(data[field]) : null;

        if (curInfo) {
            //找到了当前用户的夺宝信息，就更新当前用户信息
            curInfo['click_times'] += 1;
            curInfo['paid_amount'] += obj['amount'];
            curInfo['last_time'] = new Date().valueOf();
        } else {
            //没找到当前用户的夺宝信息，新建一个用户夺宝信息对象
            curInfo = {
                user_id: conn.curUser.id,
                user_name: conn.curUser.name,
                click_times: 1,
                paid_amount: obj['amount'],
                last_time: new Date().valueOf(),
                has_notice: false,
                reward_code: '',
                photo_url: conn.curUser.photo_url
            };
        }

        //更新redis
        redisClient.hmset(redisMainKey.ranking, field, JSON.stringify(curInfo), function () {

            //更新完后再次获取redis上的排行榜夺宝信息
            redisClient.hgetall(redisMainKey.ranking, function (err, _data) {

                var curRankingInfo = [];

                if (_data) {
                    _.each(_data, function (item, field) {
                        //获取该排行榜的所有用户夺宝信息
                        if (field.indexOf(fieldIndex) != -1) {
                            curRankingInfo.push(JSON.parse(item));
                        }
                    });

                    curRankingInfo.sort(function (a, b) {
                        return b['last_time'] - a['last_time'];
                    });
                }

                callBack && callBack(curRankingInfo);

            });

        });
    });
}

//检测活动是否到期
function checkActivity () {
    redisClient.hgetall(redisMainKey.ranking, function (err, data) {
        if (err) throw err;

        var now = new Date().valueOf(),
            hasWinnerList = data && data['hasWinnerList'] ? JSON.parse(data['hasWinnerList']) : [],
            noticeFinishList = data && data['noticeFinishList'] ? JSON.parse(data['noticeFinishList']) : [];

        _.each(global.rankingGroup, function (group) {
            _.each(group['list'], function (ranking) {

                if (ranking['end_time'] * 1 <= now) {
                    //该活动已经到期
                    var curRankingId = ranking['id'],
                        curGroupId = ranking['group_id'],
                        fieldIndex = curGroupId + '_' + curRankingId + '_',
                        hasWinnerFlag =  _.find(hasWinnerList, function (id) {
                            return id == curRankingId;
                        }),
                        noticeAllFlag =  _.find(noticeFinishList, function (id) {
                            return id == curRankingId;
                        }),
                        curRankingInfo = [];

                    if (data) {
                        //field 规则 groupId_rankingId_userId 对应为某个用户在某一排行榜的夺宝信息
                        _.each(data, function (item, field) {
                            //获取该排行榜的所有用户夺宝信息
                            if (field.indexOf(fieldIndex) != -1) {
                                curRankingInfo.push(item);
                            }
                        });
                    }

                    curRankingInfo.sort(function (a, b) {
                        return b['last_time'] - a['last_time'];
                    });

                    if (typeof hasWinnerFlag == 'undefined') {
                        //该活动还没生产获奖者
                        var totalJewel = 0,
                            userId = '',
                            userType = '';

                        if (curRankingInfo.length > 0) {
                            _.each(curRankingInfo, function (item) {
                                totalJewel += item['paid_amount'] * (-1);
                            });

                            userId = curRankingInfo[0]['user_id'];
                            userType = curRankingInfo[0]['user_type'];
                        }


                        sendHttpRequest('POST', requestConfig.paths.queryWinner, {
                            groupId: curGroupId,
                            treasureId: curRankingId,
                            userId: userId,
                            userType: userType,
                            totalJewel: totalJewel
                        }, function (re) {

                            if (re && re.returnCode == 0) {
                                ranking.status = 3;
                                var _ranking = _.extend({}, ranking);
                                delete _ranking.reward_code;

                                if (re.data.userId == curRankingInfo[0]['user_id']) {
                                    //返回的中奖用户与排行榜第一位的用户一致...
                                    curRankingInfo[0]['reward_code'] = ranking['reward_code'];
                                    //更新redis
                                    redisClient.hmset(redisMainKey.ranking, fieldIndex + re.data.userId, JSON.stringify(curRankingInfo[0]));
                                } else {
                                    //返回的中奖用户与排行榜第一位的用户不同，是机器人帐号，将机器人帐号放到排行榜最前面
                                    var robotUserInfo = {
                                        user_id: re.data.userId,
                                        user_name: re.data.nickName,
                                        click_times: 1,
                                        paid_amount: 0,
                                        last_time: new Date().valueOf() + 24 * 60 * 60 * 1000,
                                        has_notice: true,
                                        reward_code: ranking['reward_code'],
                                        photo_url: re.data.photoUrl
                                    };
                                    curRankingInfo.unshift(robotUserInfo);

                                    //更新redis
                                    redisClient.hmset(redisMainKey.ranking, fieldIndex + 'robot', JSON.stringify(robotUserInfo));

                                    //回传最新排行榜信息(向全体在线用户)
                                    ws.connections.forEach(function (conn) {
                                        conn.sendText(JSON.stringify({
                                            method: 'ranking_info_fresh',
                                            data: {
                                                group_id: curGroupId,
                                                ranking_id: curRankingId,
                                                ranking_info: curRankingInfo
                                            }
                                        }));

                                        conn.sendText(JSON.stringify({
                                            method: 'activity_update',
                                            data: {
                                                query_group: curGroupId,
                                                query_ranking: curRankingId,
                                                query_ranking_result: _ranking
                                            }
                                        }));
                                    });
                                }

                                hasWinnerList.push(curRankingId);
                                //更新已生产获奖者活动list的redis
                                redisClient.hmset(redisMainKey.ranking, 'hasWinnerList', JSON.stringify(hasWinnerList));

                                //通知用户获奖情况
                                noticeUser(curGroupId, curRankingId, curRankingInfo, noticeFinishList);
                            } else if (re && re.returnCode == 401) {
                                //后台返回错误码，告知此活动已经结束并生成了获奖者
                                hasWinnerList.push(curRankingId);
                                //更新已生产获奖者活动list的redis
                                redisClient.hmset(redisMainKey.ranking, 'hasWinnerList', JSON.stringify(hasWinnerList));

                                //通知用户获奖情况
                                noticeUser(curGroupId, curRankingId, curRankingInfo, noticeFinishList);
                            }

                        });
                    } else {
                        if (typeof noticeAllFlag == 'undefined') {
                            //该活动还没通知完所有参与夺宝的用户,通知用户获奖情况
                            noticeUser(curGroupId, curRankingId, curRankingInfo, noticeFinishList);
                        }
                    }

                }

            });
        });

    });
}

//通知用户获奖信息
function noticeUser (curGroupId, curRankingId, curRankingInfo, noticeFinishList) {
    var changeFlag = false,
        len = curRankingInfo.length,
        obj = {},
        hasNoticeCount = 0;

    _.each(ws.connections, function (item, i) {
        //遍历当前在线用户，看该用户是否参与过当前活动的夺宝
        for (var i = 0; i < len; i++) {
            var curInfo = curRankingInfo[i];
            if (curInfo['user_id'] == item.curUser.id && !curInfo['has_notice']) {

                //推送获奖信息给参与了该排行榜夺宝的用户(还没通知的)
                item.sendText(JSON.stringify({
                    method: 'awards_notice',
                    data: {
                        group_id: curGroupId,
                        ranking_id: curRankingId,
                        ranking_result: curInfo['reward_code']
                    }
                }));

                //将该用户设为已通知
                curInfo['has_notice'] = true;
                //改动标记设为true
                changeFlag = true;
                obj[curGroupId + '_' + curRankingId + '_' + item.curUser.id] = JSON.stringify(curInfo);
                break;

            }
        }
    });

    if (changeFlag) {
        //向用户推送过信息，排行榜列表对象发生过变化，更新redis
        redisClient.hmset(redisMainKey.ranking, obj);
    }

    _.each(curRankingInfo, function (item) {
        if (item['has_notice']) {
            hasNoticeCount++;
        }
    });

    if (len == hasNoticeCount) {
        //如果该排行榜里所有参与夺宝的用户都已经通知过，将该排行榜ID加入到通知完毕列表之中，并更新redis
        noticeFinishList.push(curRankingId);
        redisClient.hmset(redisMainKey.ranking, 'noticeFinishList', JSON.stringify(noticeFinishList));
    }
}
