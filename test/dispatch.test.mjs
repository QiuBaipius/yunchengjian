// 派单算法回归测试：逐人绕路约束（不再只看首位乘客）+ 最优位次插入
import { evaluateInsertion, selectBestVehicle } from '../src/services/dispatch.js'

let fail = 0
const ok = (cond, msg) => { console.log((cond ? '✓' : '✗') + ' ' + msg); if (!cond) fail++ }

// 合成站点与欧氏距离（km 单位），精确控制几何
const A = { id: 'A', x: 0, y: 0 }
const B = { id: 'B', x: 2, y: 0 }
const D = { id: 'D', x: 6, y: 0 }
const F = { id: 'F', x: 0, y: 9 } // 新乘客上车点：车辆正上方 9km（与 B/D 方向相反）
const G = { id: 'G', x: 0, y: 10 } // 新乘客下车点
const kmFn = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const stopOf = (id) => ({ A, B, D, F, G }[id] || null)
const base = { kmFn, stopOf, capacity: 17, detourRatio: 1 / 3, waitMaxMin: 20, speedKmPerMin: 0.5 }

// 1) 空车：接受，且上车 ETA 由「车辆→上车点」最优路径决定
const empty = { id: 'v0', onboard: 0, riders: [], x: 0, y: 0, capacity: 17 }
const e1 = evaluateInsertion(empty, A, D, 6, base)
ok(e1.ok && e1.pickupEtaMin === 0, `空车接受，车辆已在起点（上车 ETA ${e1.pickupEtaMin} min）`)

// 2) 满载：不允许超员（PRD 规则 5）
const full = { id: 'v1', onboard: 17, riders: [], x: 0, y: 0, capacity: 17 }
const e2 = evaluateInsertion(full, A, D, 6, base)
ok(!e2.ok && e2.reason === 'capacity', '满载拒单（不允许超员）')

// 3) 绕路不可避免时拒单：车上两位乘客，新乘客方向完全相反，任何插入顺序都会
//    让 r1 或 r2 的乘车里程大幅超出其 OD 最优路径的 133%
const two = {
  id: 'v2', onboard: 2, capacity: 17, x: 0, y: 0,
  riders: [
    { orderId: 'r1', fromId: A, toId: B },
    { orderId: 'r2', fromId: B, toId: D },
  ],
}
const e3 = evaluateInsertion(two, F, G, 1, base)
ok(!e3.ok, '绕路不可避免时拒单（第二位乘客也受约束，而非只看首位）')

// 4) 放宽预算后应接受，证明 3) 的拒单来自「逐人预算」而非算法 bug
const loose = evaluateInsertion(two, F, G, 1, { ...base, detourRatio: 100 })
ok(loose.ok, '放宽绕行预算后接受（说明判定来自预算约束）')
ok(loose.perRider.length === 2, `逐人校验覆盖全部 ${loose.perRider.length} 位在车乘客（不再只看首位）`)
ok(loose.perRider.every((p) => p.direct > 0), '每位乘客都用各自的 OD 最优路径作为预算基准')

// 5) selectBestVehicle：按「加入后用时增加最少」排序
const near = { id: 'n', onboard: 0, riders: [], x: 0, y: 0, capacity: 17, areaId: 'a1' }
const far = { id: 'f', onboard: 0, riders: [], x: 3, y: 0, capacity: 17, areaId: 'a1' }
const r = selectBestVehicle([far, near], A, D, { odKm: 6, kmFn, stopOf, areaMatch: false })
ok(r.candidates.length === 2, `两辆空车都可行（${r.candidates.length} 候选）`)
ok(r.candidates[0].v.id === 'n', `选增量最少的车（${r.candidates[0].v.id} 优于 ${r.candidates[1].v.id}）`)

console.log(fail ? `\n${fail} 项失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
