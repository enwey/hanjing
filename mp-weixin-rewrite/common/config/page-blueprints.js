const pageBlueprints = {
  "pages/appointment/store-select": {
    "title": "选择门店",
    "description": "此页负责按城市和定位选择门店，并将门店上下文带入后续预约链路。",
    "bullets": [
      "门店列表需要支持真实距离、状态和营业信息",
      "选择门店后进入顾问列表，并保留门店上下文",
      "无定位权限时仍可手动完成选择"
    ],
    "entries": [
      {
        "title": "进入顾问列表",
        "description": "以所选门店为上下文继续预约。",
        "url": "/pages/appointment/doctor-list"
      }
    ]
  },
  "pages/appointment/doctor-list": {
    "title": "选择顾问",
    "description": "此页负责根据门店展示顾问列表，并按真实排班进入顾问详情或时段选择。",
    "bullets": [
      "顾问信息必须来自真实排班与门店关联",
      "筹建中门店或无排班顾问要显示真实空态",
      "选中顾问后进入详情或直接选择时段"
    ],
    "entries": [
      {
        "title": "顾问详情",
        "description": "查看顾问介绍、服务时间和预约入口。",
        "url": "/pages/appointment/doctor-detail"
      }
    ]
  },
  "pages/appointment/doctor-detail": {
    "title": "顾问详情",
    "description": "此页展示顾问专业信息、所属门店、服务安排和预约入口。",
    "bullets": [
      "详情数据应与门店和排班联动",
      "预约按钮需要带上顾问和门店上下文",
      "返回链路应回到当前预约流程而不是首页"
    ],
    "entries": [
      {
        "title": "选择时段",
        "description": "基于当前顾问进入可预约时段页。",
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
        "description": "确认门店、顾问、时间和服务对象。",
        "url": "/pages/appointment/confirm"
      }
    ]
  },
  "pages/appointment/confirm": {
    "title": "预约确认",
    "description": "此页负责确认门店、顾问、时段、服务对象和支付信息，并提交预约。",
    "bullets": [
      "确认页要带出当前服务对象真实身份",
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
      "保留原预约单号和已选顾问信息",
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
      "如果需要到店提醒，应在此页引导消息订阅"
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
    "description": "此页负责 ESS 问卷答题、题目切换、提交与当前服务对象上下文。",
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
    "title": "服务时间线",
    "description": "此页负责展示当前服务对象的服务记录、时间线节点和前往预约入口。",
    "bullets": [
      "如果没有真实佩戴记录要显示真实空态",
      "有佩戴记录时应按当前服务对象过滤",
      "点击节点后进入对应详情"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有佩戴记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/sleep-trend/index": {
    "title": "睡眠趋势",
    "description": "此页负责展示当前服务对象的趋势图、完整日历入口和真实佩戴数据。",
    "bullets": [
      "顶部要基于当前服务对象刷新",
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
    "title": "健康建议",
    "description": "此页负责展示顾问对当前服务对象的健康建议。",
    "bullets": [
      "没有真实佩戴记录时显示真实空态",
      "有数据时必须按当前服务对象过滤",
      "入口文案和按钮与佩戴页风格统一"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有佩戴记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/adjust-detail/index": {
    "title": "设备调整",
    "description": "此页负责展示设备调整记录、参数变化和关联顾问信息。",
    "bullets": [
      "没有真实佩戴记录时显示空态",
      "有数据时按当前服务对象过滤",
      "参数变化需要来自真实调整记录"
    ],
    "entries": [
      {
        "title": "前往预约",
        "description": "没有佩戴记录时进入预约流程。",
        "url": "/pages/appointment/index"
      }
    ]
  },
  "pages/treatment/calendar/index": {
    "title": "打卡日历",
    "description": "此页负责展示当前服务对象的完整佩戴日历和当月打卡数据。",
    "bullets": [
      "只展示当前服务对象当前设备的数据",
      "无记录时显示当月空态",
      "底部不保留与需求无关的佩戴进度布局"
    ],
    "entries": []
  },
  "pages/treatment/sleep-report/index": {
    "title": "睡眠报告",
    "description": "此页负责展示当前服务对象的佩戴期睡眠报告与核心指标。",
    "bullets": [
      "报告数据必须真实",
      "与当前服务对象联动刷新",
      "无真实记录时显示空态"
    ],
    "entries": []
  },
  "pages/profile/medical-records/index": {
    "title": "健康档案",
    "description": "此页负责按当前服务对象查看健康档案，并支持切换服务对象。",
    "bullets": [
      "列表必须显示服务对象",
      "不再保留报告图片上传附件入口",
      "切换服务对象后要刷新对应档案"
    ],
    "entries": [
      {
        "title": "家庭成员",
        "description": "维护成员并切换当前服务对象。",
        "url": "/pages/profile/family-members/index"
      }
    ]
  },
  "pages/profile/device-manage/index": {
    "title": "阻鼾器管理",
    "description": "此页负责按当前服务对象查看阻鼾器、佩戴数据、维护和反馈入口。",
    "bullets": [
      "切换当前服务对象后必须刷新设备数据",
      "没有佩戴记录时隐藏不应显示的入口",
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
    "description": "此页负责展示当前服务对象与当前设备的佩戴数据。",
    "bullets": [
      "只看当前设备链路的数据",
      "切换当前服务对象后实时刷新",
      "历史设备数据不混入当前设备统计"
    ],
    "entries": []
  },
  "pages/profile/device-manage/maintenance/index": {
    "title": "维护记录",
    "description": "此页负责展示当前设备的维护、更换和售后处理记录。",
    "bullets": [
      "只看当前设备相关记录",
      "与当前服务对象和当前设备联动",
      "无记录时展示真实空态"
    ],
    "entries": []
  },
  "pages/profile/device-manage/feedback/index": {
    "title": "使用反馈",
    "description": "此页负责收集当前服务对象对设备使用情况的反馈。",
    "bullets": [
      "反馈提交到真实接口",
      "与当前设备和当前服务对象关联",
      "提交后可回看历史反馈"
    ],
    "entries": []
  },
  "pages/profile/family-members/index": {
    "title": "家庭成员",
    "description": "此页负责管理关联成员，并维护当前服务对象的上下文。",
    "bullets": [
      "本人信息不能随意编辑成附属成员逻辑",
      "添加成员时按身份证/手机号规则自动识别关系",
      "切换当前服务对象应驱动佩戴、健康档案和设备页刷新"
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
    "description": "此页负责新增家庭成员，并按规则处理身份证、手机号和档案号。",
    "bullets": [
      "年龄不应有默认值",
      "手机号、身份证号、档案号按规则识别同一人",
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
      "支持修改身份证号，但不允许修改档案号",
      "修改资料后当前账号访问的人档案不应被替换",
      "需要展示用户身份证号和档案号"
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
