const pageBlueprints = {
  "pages/appointment/store-select": {
    "title": "选择门店",
    "description": "此页负责按城市和定位选择门店，并将门店上下文带入后续预约链路。",
    "bullets": [
      "门店列表需要支持真实距离、状态和营业信息",
      "选择门店后进入医生列表，并保留门店上下文",
      "无定位权限时仍可手动完成选择"
    ],
    "entries": [
      {
        "title": "进入医生列表",
        "description": "以所选门店为上下文继续预约。",
        "url": "/pages/appointment/doctor-list"
      }
    ]
  },
  "pages/appointment/doctor-list": {
    "title": "选择医生",
    "description": "此页负责根据门店展示医生列表，并按真实排班进入医生详情或时段选择。",
    "bullets": [
      "医生信息必须来自真实排班与门店关联",
      "筹建中门店或无排班医生要显示真实空态",
      "选中医生后进入详情或直接选择时段"
    ],
    "entries": [
      {
        "title": "医生详情",
        "description": "查看医生介绍、门诊时间和预约入口。",
        "url": "/pages/appointment/doctor-detail"
      }
    ]
  },
  "pages/appointment/doctor-detail": {
    "title": "医生详情",
    "description": "此页展示医生专业信息、所属门店、出诊安排和预约入口。",
    "bullets": [
      "详情数据应与门店和排班联动",
      "预约按钮需要带上医生和门店上下文",
      "返回链路应回到当前预约流程而不是首页"
    ],
    "entries": [
      {
        "title": "选择时段",
        "description": "基于当前医生进入可预约时段页。",
        "url": "/pages/appointment/time-select"
      }
    ]
  },
  "pages/appointment/time-select": {
    "title": "选择时段",
    "description": "此页负责按日期展示真实可预约时段，并处理占满、临近截止和不可预约场景。",
    "bullets": [
      "时段状态必须基于真实预约占用数据",
      "待支付占位和已预约占位要按规则区分",
      "选中时段后进入预约确认"
    ],
    "entries": [
      {
        "title": "预约确认",
        "description": "确认门店、医生、时间和就诊人。",
        "url": "/pages/appointment/confirm"
      }
    ]
  },
  "pages/appointment/confirm": {
    "title": "预约确认",
    "description": "此页负责确认门店、医生、时段、就诊人和支付信息，并提交预约。",
    "bullets": [
      "确认页要带出当前就诊人真实身份",
      "支付前的隐私、须知和前置问题都应在这里处理",
      "提交后进入预约成功或待支付状态"
    ],
    "entries": [
      {
        "title": "预约成功",
        "description": "查看预约提交后的结果页。",
        "url": "/pages/appointment/success"
      }
    ]
  },
  "pages/appointment/detail": {
    "title": "预约详情",
    "description": "此页负责展示预约状态、支付状态、门店导航、改约和取消动作。",
    "bullets": [
      "详情必须与预约状态流转一致",
      "待支付预约要支持继续支付",
      "已预约要支持改约、取消与地图导航"
    ],
    "entries": [
      {
        "title": "门店地图",
        "description": "查看门店位置与导航。",
        "url": "/pages/appointment/map"
      },
      {
        "title": "改约",
        "description": "重新选择新的预约时段。",
        "url": "/pages/appointment/reschedule"
      }
    ]
  },
  "pages/appointment/map": {
    "title": "门店地图",
    "description": "此页负责展示预约门店位置、路线和导航能力。",
    "bullets": [
      "需要基于真实门店经纬度展示",
      "没有位置权限时仍可查看地址信息",
      "从预约详情进入后应保持当前预约上下文"
    ],
    "entries": []
  },
  "pages/appointment/reschedule": {
    "title": "改约",
    "description": "此页承接原预约详情，重新进入时段选择并提交改约。",
    "bullets": [
      "保留原预约单号和已选医生信息",
      "改约后的时间占用要按真实规则重新校验",
      "成功后返回预约详情并刷新状态"
    ],
    "entries": [
      {
        "title": "选择时段",
        "description": "为当前预约重新选择可用时段。",
        "url": "/pages/appointment/time-select"
      }
    ]
  },
  "pages/appointment/success": {
    "title": "预约成功",
    "description": "此页展示预约完成结果，并引导回到预约详情或继续后续准备事项。",
    "bullets": [
      "需要区分已支付预约和待支付预约",
      "成功后要能回到预约详情",
      "如果需要就诊提醒，应在此页引导消息订阅"
    ],
    "entries": [
      {
        "title": "预约详情",
        "description": "查看刚刚提交的预约详情。",
        "url": "/pages/appointment/detail"
      }
    ]
  },
  "pages/assessment/questionnaire/index": {
    "title": "ESS嗜睡量表",
    "description": "此页负责 ESS 问卷答题、题目切换、提交与当前就诊人上下文。",
    "bullets": [
      "题目来源必须是后端真实题库",
      "重新评估时要直接进入答题，不显示结果空态",
      "提交后进入 ESS 评估结果页"
    ],
    "entries": [
      {
        "title": "评估结果",
        "description": "查看 ESS 评估得分、等级和建议。",
        "url": "/pages/assessment/result/index"
      }
    ]
  },
  "pages/assessment/result/index": {
    "title": "评估结果",
    "description": "此页展示 ESS 得分、等级说明、睡眠建议和重新评估入口。",
    "bullets": [
      "返回应回到睡眠评估页，不应回首页",
      "重新评估要直接进入量表页",
      "等级文案和颜色应与得分规则严格对应"
    ],
    "entries": [
      {
        "title": "重新评估",
        "description": "重新进入 ESS 量表答题页。",
        "url": "/pages/assessment/questionnaire/index"
      }
    ]
  },
  "pages/assessment/recording/index": {
    "title": "AI鼾声分析",
    "description": "此页负责录音、生成鼾声报告、亮度控制和异常录音校验。",
    "bullets": [
      "录音不足 5 秒时要在生成前拦截",
      "生成过程需要中间态提示并直接进入结果页",
      "录音期间屏幕亮度控制要可恢复"
    ],
    "entries": [
      {
        "title": "鼾声分析报告",
        "description": "查看分析结果和风险判断。",
        "url": "/pages/assessment/snore-result/index"
      }
    ]
  },
  "pages/assessment/snore-result/index": {
    "title": "鼾声分析报告",
    "description": "此页展示 AI 鼾声分析结果、风险等级、建议和明细入口。",
    "bullets": [
      "结果必须来自真实分析数据",
      "返回链路应回到睡眠评估页",
      "报告中的图标和按钮风格应与全局统一"
    ],
    "entries": []
  },
  "pages/treatment/timeline/index": {
    "title": "治疗时间线",
    "description": "此页负责展示当前治疗人的诊疗记录、时间线节点和前往预约入口。",
    "bullets": [
      "如果没有真实治疗记录要显示真实空态",
      "有治疗记录时应按当前治疗人过滤",
      "点击节点后进入对应详情"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有治疗记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/sleep-trend/index": {
    "title": "睡眠趋势",
    "description": "此页负责展示当前治疗人的趋势图、完整日历入口和真实佩戴数据。",
    "bullets": [
      "顶部要基于当前治疗人刷新",
      "不能使用兜底趋势数据",
      "完整日历入口应进入打卡日历页"
    ],
    "entries": [
      {
        "title": "打卡日历",
        "description": "查看完整的佩戴记录日历。",
        "url": "/pages/treatment/calendar/index"
      }
    ]
  },
  "pages/treatment/doctor-advice/index": {
    "title": "医嘱建议",
    "description": "此页负责展示医生对当前治疗人的医嘱与建议。",
    "bullets": [
      "没有真实治疗记录时显示真实空态",
      "有数据时必须按当前治疗人过滤",
      "入口文案和按钮与治疗页风格统一"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有治疗记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/adjust-detail/index": {
    "title": "设备调整",
    "description": "此页负责展示设备调整记录、参数变化和关联医生信息。",
    "bullets": [
      "没有真实治疗记录时显示空态",
      "有数据时按当前治疗人过滤",
      "参数变化需要来自真实调整记录"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有治疗记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/calendar/index": {
    "title": "打卡日历",
    "description": "此页负责展示当前治疗人的完整佩戴日历和当月打卡数据。",
    "bullets": [
      "只展示当前治疗人当前设备的数据",
      "无记录时显示当月空态",
      "底部不保留与需求无关的治疗进度布局"
    ],
    "entries": []
  },
  "pages/treatment/sleep-report/index": {
    "title": "睡眠报告",
    "description": "此页负责展示当前治疗人的治疗期睡眠报告与核心指标。",
    "bullets": [
      "报告数据必须真实",
      "与当前治疗人联动刷新",
      "无真实记录时显示空态"
    ],
    "entries": []
  },
  "pages/product/detail": {
    "title": "商品详情",
    "description": "此页负责展示商品详情、确认订单、模拟支付与下单结果链路。",
    "bullets": [
      "商品图片和详情必须来自真实数据",
      "底部确认支付应进入订单链路",
      "没有封面图时使用灰底图标占位，而不是默认图"
    ],
    "entries": [
      {
        "title": "我的订单",
        "description": "支付后查看订单列表与订单详情。",
        "url": "/pages/order/index"
      }
    ]
  },
  "pages/order/detail": {
    "title": "订单详情",
    "description": "此页负责展示订单状态、商品、支付、物流、售后和通知关联。",
    "bullets": [
      "详情数据必须来自真实订单",
      "底部按钮风格与医生详情统一",
      "支付成功后应驱动订单状态与通知变化"
    ],
    "entries": []
  },
  "pages/profile/medical-records/index": {
    "title": "病历档案",
    "description": "此页负责按当前就诊人查看病历档案，并支持切换就诊人。",
    "bullets": [
      "列表必须显示就诊人",
      "不再保留报告图片上传附件入口",
      "切换就诊人后要刷新对应档案"
    ],
    "entries": [
      {
        "title": "家庭成员",
        "description": "维护成员并切换当前就诊人。",
        "url": "/pages/profile/family-members/index"
      }
    ]
  },
  "pages/profile/device-manage/index": {
    "title": "阻鼾器管理",
    "description": "此页负责按当前就诊人查看阻鼾器、佩戴数据、维护和反馈入口。",
    "bullets": [
      "切换当前就诊人后必须刷新设备数据",
      "没有治疗记录时隐藏不应显示的入口",
      "设备相关数据只看当前绑定设备链路"
    ],
    "entries": [
      {
        "title": "佩戴数据",
        "description": "查看阻鼾器佩戴数据与趋势。",
        "url": "/pages/profile/device-manage/wearing-data/index"
      },
      {
        "title": "维护记录",
        "description": "查看设备维护与更换记录。",
        "url": "/pages/profile/device-manage/maintenance/index"
      },
      {
        "title": "使用反馈",
        "description": "提交并查看设备使用反馈。",
        "url": "/pages/profile/device-manage/feedback/index"
      }
    ]
  },
  "pages/profile/device-manage/wearing-data/index": {
    "title": "佩戴数据",
    "description": "此页负责展示当前就诊人与当前设备的佩戴数据。",
    "bullets": [
      "只看当前设备链路的数据",
      "切换当前就诊人后实时刷新",
      "历史设备数据不混入当前设备统计"
    ],
    "entries": []
  },
  "pages/profile/device-manage/maintenance/index": {
    "title": "维护记录",
    "description": "此页负责展示当前设备的维护、更换和售后处理记录。",
    "bullets": [
      "只看当前设备相关记录",
      "与当前就诊人和当前设备联动",
      "无记录时展示真实空态"
    ],
    "entries": []
  },
  "pages/profile/device-manage/feedback/index": {
    "title": "使用反馈",
    "description": "此页负责收集当前就诊人对设备使用情况的反馈。",
    "bullets": [
      "反馈提交到真实接口",
      "与当前设备和当前就诊人关联",
      "提交后可回看历史反馈"
    ],
    "entries": []
  },
  "pages/profile/family-members/index": {
    "title": "家庭成员",
    "description": "此页负责管理关联成员，并维护当前就诊人的上下文。",
    "bullets": [
      "本人信息不能随意编辑成附属成员逻辑",
      "添加成员时按身份证/手机号规则自动识别关系",
      "切换当前就诊人应驱动治疗、病历和设备页刷新"
    ],
    "entries": [
      {
        "title": "添加成员",
        "description": "创建新的关联家庭成员。",
        "url": "/pages/profile/family-members/add-member/index"
      }
    ]
  },
  "pages/profile/family-members/add-member/index": {
    "title": "添加成员",
    "description": "此页负责新增家庭成员，并按规则处理身份证、手机号和就诊卡号。",
    "bullets": [
      "年龄不应有默认值",
      "手机号、身份证号、就诊卡号按规则识别同一人",
      "添加成员不应破坏已登录账号的人档案绑定"
    ],
    "entries": []
  },
  "pages/profile/member-benefits/index": {
    "title": "会员权益",
    "description": "此页负责展示累计消费、会员等级、积分和当前可享权益。",
    "bullets": [
      "数据必须来自真实消费与等级规则",
      "权益项不能重复",
      "消费变动后页面要能看到实时变化"
    ],
    "entries": []
  },
  "pages/profile/notifications/index": {
    "title": "消息通知",
    "description": "此页负责聚合订单、预约、社区互动和系统通知消息。",
    "bullets": [
      "包括订单支付与状态变化",
      "包括预约支付与状态变化",
      "包括社区帖子回复、点赞等通知"
    ],
    "entries": []
  },
  "pages/profile/online-service/index": {
    "title": "在线客服",
    "description": "此页负责用户与后台在线咨询之间的消息闭环。",
    "bullets": [
      "发送消息后后台在线咨询要可见",
      "会话列表和详情要基于真实数据",
      "支持继续沟通和消息状态刷新"
    ],
    "entries": []
  },
  "pages/profile/settings/index": {
    "title": "设置",
    "description": "此页负责聚合个人资料、账号安全、隐私和其他系统设置入口。",
    "bullets": [
      "设置项应围绕真实功能组织",
      "入口文案要准确反映业务含义",
      "需要与个人信息和账号安全联动"
    ],
    "entries": [
      {
        "title": "个人信息",
        "description": "查看和修改登录用户资料。",
        "url": "/pages/profile/settings/personal-info/index"
      },
      {
        "title": "账号安全",
        "description": "查看手机号、实名信息和安全状态。",
        "url": "/pages/profile/settings/account-security/index"
      }
    ]
  },
  "pages/profile/settings/personal-info/index": {
    "title": "个人信息",
    "description": "此页负责展示和修改当前登录账号的个人资料。",
    "bullets": [
      "支持修改身份证号，但不允许修改就诊卡号",
      "修改资料后当前账号访问的人档案不应被替换",
      "需要展示用户身份证号和就诊卡号"
    ],
    "entries": []
  },
  "pages/profile/settings/account-security/index": {
    "title": "账号安全",
    "description": "此页负责处理绑定手机号、实名状态和安全相关资料。",
    "bullets": [
      "手机号更换和实名修改都需要真实校验",
      "如果身份证被已登录用户占用，应明确提示",
      "不能因为附属成员信息冲突误拦截当前账号"
    ],
    "entries": []
  },
  "pages/distribution/center/index": {
    "title": "分销中心",
    "description": "此页负责聚合邀请码、邀请人数、订单佣金和团队入口。",
    "bullets": [
      "不需要手动开通分销",
      "只要邀请绑定成立即可进入分销链路",
      "分销统计必须基于真实数据"
    ],
    "entries": [
      {
        "title": "邀请好友",
        "description": "查看邀请码、海报和分享入口。",
        "url": "/pages/distribution/invite/index"
      },
      {
        "title": "佣金明细",
        "description": "查看累计佣金和入账记录。",
        "url": "/pages/distribution/commission/index"
      },
      {
        "title": "推广订单",
        "description": "查看邀请带来的订单记录。",
        "url": "/pages/distribution/orders/index"
      },
      {
        "title": "团队成员",
        "description": "查看绑定关系和团队成员。",
        "url": "/pages/distribution/team/index"
      },
      {
        "title": "提现申请",
        "description": "进入佣金提现流程。",
        "url": "/pages/distribution/withdraw/index"
      },
      {
        "title": "分销规则",
        "description": "查看当前佣金与结算规则。",
        "url": "/pages/distribution/rules/index"
      }
    ]
  },
  "pages/distribution/commission/index": {
    "title": "佣金明细",
    "description": "此页负责展示分销佣金来源、状态与结算记录。",
    "bullets": [
      "佣金只统计符合规则的订单",
      "需要区分待结算和可提现金额",
      "当前用户邀请关系变化后应实时反映"
    ],
    "entries": []
  },
  "pages/distribution/orders/index": {
    "title": "推广订单",
    "description": "此页负责展示由邀请关系带来的订单记录与佣金状态。",
    "bullets": [
      "订单必须基于真实分销关系",
      "展示订单金额、状态和对应佣金",
      "支持查看订单详情链路"
    ],
    "entries": [
      {
        "title": "订单详情",
        "description": "查看推广订单对应的订单详情。",
        "url": "/pages/order/detail"
      }
    ]
  },
  "pages/distribution/withdraw/index": {
    "title": "提现申请",
    "description": "此页负责提交佣金提现申请，并展示可提现余额。",
    "bullets": [
      "余额要来自真实佣金统计",
      "提现方式和账户信息按真实规则提交",
      "提交后进入提现记录查看状态"
    ],
    "entries": [
      {
        "title": "提现记录",
        "description": "查看历史提现记录和审核状态。",
        "url": "/pages/distribution/withdraw-records/index"
      }
    ]
  },
  "pages/distribution/withdraw-records/index": {
    "title": "提现记录",
    "description": "此页负责展示提现申请的时间、金额和审核结果。",
    "bullets": [
      "记录必须来自真实提现表",
      "需要展示审核中、通过、驳回状态",
      "与分销中心余额统计联动"
    ],
    "entries": []
  },
  "pages/distribution/team/index": {
    "title": "团队成员",
    "description": "此页负责展示通过邀请关系形成的团队成员列表。",
    "bullets": [
      "成员关系来自自动绑定规则",
      "不是手动认领模式",
      "需要区分本人和邀请成员的数据"
    ],
    "entries": []
  },
  "pages/distribution/products/index": {
    "title": "推广商品",
    "description": "此页负责展示可推广商品及其分销属性。",
    "bullets": [
      "商品信息必须来自真实商品库",
      "不同商品应展示真实佣金规则",
      "进入后可跳转商品详情链路"
    ],
    "entries": [
      {
        "title": "商品详情",
        "description": "查看推广商品对应的商城详情。",
        "url": "/pages/product/detail"
      }
    ]
  },
  "pages/distribution/rules/index": {
    "title": "分销规则",
    "description": "此页负责展示当前分销邀请、绑定、下单、结算和提现规则。",
    "bullets": [
      "规则文案要与真实业务一致",
      "邀请无需手动开通",
      "绑定关系由系统自动完成"
    ],
    "entries": []
  },
  "pages/live/list/index": {
    "title": "直播中心",
    "description": "此页负责展示直播列表和回放入口。",
    "bullets": [
      "直播数据来自真实直播源",
      "列表需要区分直播中和回放",
      "进入后查看直播详情"
    ],
    "entries": [
      {
        "title": "直播详情",
        "description": "查看直播间详情或回放。",
        "url": "/pages/live/playback/index"
      }
    ]
  },
  "pages/live/playback/index": {
    "title": "直播详情",
    "description": "此页负责展示直播内容详情、讲者信息和回放播放。",
    "bullets": [
      "详情来自真实直播数据",
      "回放播放需和直播状态联动",
      "页面风格与其他内容页统一"
    ],
    "entries": []
  },
  "pages/auth/agreement/index": {
    "title": "用户协议",
    "description": "此页负责展示用户协议内容，并为登录或授权流程提供入口说明。",
    "bullets": [
      "协议内容应来自真实文案",
      "页面标题和返回行为要稳定",
      "与隐私政策入口互相联通"
    ],
    "entries": [
      {
        "title": "隐私政策",
        "description": "查看小程序隐私政策。",
        "url": "/pages/auth/privacy/index"
      }
    ]
  },
  "pages/auth/privacy/index": {
    "title": "隐私政策",
    "description": "此页负责展示小程序隐私政策与相关授权说明。",
    "bullets": [
      "内容应与实际权限申请一致",
      "需要覆盖定位、录音等核心权限",
      "与用户协议形成完整阅读路径"
    ],
    "entries": [
      {
        "title": "用户协议",
        "description": "返回查看用户协议内容。",
        "url": "/pages/auth/agreement/index"
      }
    ]
  }
};

module.exports = { pageBlueprints };
