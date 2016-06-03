var _ = require('underscore'),//引入 underscore 模块
    activityMod = {
        //活动信息更新
        update: function (req, res) {
            var groupId = req.param('group_id'),
                rankingId = req.param('ranking_id');

            redisClient.hgetall(redisMainKey.treasure, function (err, data) {
                if (err) {
                    res.send({
                        code: 100,
                        error: err,
                        msg: 'redis error'
                    });
                }

                if (data) {

                    var flag = true,
                        newRanking = data['GROUP_PREFIX_' + groupId + '_' + rankingId] ? JSON.parse(data['GROUP_PREFIX_' + groupId + '_' + rankingId]): null;

                    if (newRanking) {

                        redisClient.hgetall(redisMainKey.ranking, function (err, data) {
                            if (err) throw err;

                            var curRankingInfo = [];

                            if (data) {
                                //field 规则 groupId_rankingId_userId 对应为某个用户在某一排行榜的夺宝信息
                                _.each(data, function (item, field) {
                                    //获取该排行榜的所有用户夺宝信息
                                    if (field.indexOf(groupId + '_' + rankingId + '_') != -1) {
                                        curRankingInfo.push(JSON.parse(item));
                                    }
                                });

                                curRankingInfo.sort(function (a, b) {
                                    return b['last_time'] - a['last_time'];
                                });

                                newRanking['first_user_id'] = curRankingInfo.length > 0 ? curRankingInfo[0]['user_id'] : '';
                                newRanking['first_user_name'] = curRankingInfo.length > 0 ? curRankingInfo[0]['user_name'] : newRanking['winnerName'] || '';
                            } else {
                                newRanking['first_user_id'] = '';
                                newRanking['first_user_name'] = '';
                            }

                            //得到最新活动商品信息后的处理逻辑...
                            if (!global.rankingGroup[groupId]) {
                                //不存在该group
                                global.rankingGroup[groupId] = {
                                    id: groupId,
                                    list: []
                                };

                            } else {
                                //已存在该group
                                for (var i = 0, length = global.rankingGroup[groupId]['list'].length; i < length; i++) {
                                    if (global.rankingGroup[groupId]['list'][i]['id'] == rankingId) {
                                        //该group里存在该活动商品，更新覆盖
                                        global.rankingGroup[groupId]['list'][i] = newRanking;
                                        flag = false;
                                        break;
                                    }
                                }
                            }

                            if (flag) {
                                //需要插入新的活动商品信息
                                global.rankingGroup[groupId]['list'].push(newRanking);
                            }

                            ws.connections.forEach(function (conn) {
                                conn.sendText(JSON.stringify({
                                    method: 'activity_update',
                                    data: {
                                        query_group: groupId,
                                        query_ranking: rankingId,
                                        query_ranking_result: newRanking
                                    }
                                }));
                            });

                            res.send({
                                code: 0,
                                msg: 'success'
                            });
                        });

                    } else {
                        res.send({
                            code: 1,
                            msg: 'can not find this activity on redis'
                        });
                    }

                }
            });
        }
    };

module.exports = activityMod;
