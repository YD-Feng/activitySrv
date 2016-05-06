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
                        newRanking = JSON.parse(data['GROUP_PREFIX_' + groupId + '_' + rankingId]);

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

                }
            });
        }
    };

module.exports = activityMod;
