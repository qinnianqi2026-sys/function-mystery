// Each property has one precise meaning across the entire question bank.
export const QUESTIONS = [
  { id: 'even', text: '它关于 y 轴对称吗？', meaning: '标准图像关于 y 轴对称（偶函数）', category: 'symmetry' },
  { id: 'multipleBranches', text: '它有不止一个分支吗？', meaning: '完整图像有不连通的分支', category: 'structure' },
  { id: 'periodic', text: '它会周期性重复吗？', meaning: '存在非零周期，定义域也随此周期保持不变', category: 'period' },
  { id: 'odd', text: '它关于原点中心对称吗？', meaning: '关于原点中心对称（奇函数）', category: 'symmetry' },
  { id: 'verticalAsymptote', text: '它有竖直渐近线吗？', meaning: '有竖直渐近线', category: 'asymptote' },
  { id: 'allRealDomain', text: '它的定义域是全体实数吗？', meaning: '定义域为全体实数', category: 'domain' },
  { id: 'passesOrigin', text: '它经过原点吗？', meaning: '图像包含 (0,0)', category: 'point' },
  { id: 'hasMinimum', text: '它有全局最小值吗？', meaning: '在整个定义域上有取到的最小值', category: 'extremum' },
  { id: 'nonnegative', text: '它的函数值都不小于零吗？', meaning: '对定义域内所有 x，都有 y≥0', category: 'range' },
  { id: 'horizontalAsymptote', text: '它有水平渐近线吗？', meaning: '在至少一个无穷方向上有水平渐近线', category: 'asymptote' },
  { id: 'increasing', text: '它在整个定义域上严格递增吗？', meaning: '整个定义域上任意 x1<x2 均有 f(x1)<f(x2)，不是只问各分支', category: 'monotonicity' },
  { id: 'decreasing', text: '它在整个定义域上严格递减吗？', meaning: '整个定义域上任意 x1<x2 均有 f(x1)>f(x2)', category: 'monotonicity' },
  { id: 'hasZero', text: '它与 x 轴有交点吗？', meaning: '至少一个零点，相切也算交点', category: 'point' },
  { id: 'hasCorner', text: '它有尖角吗？', meaning: '定义域内部存在左右导数不相等的尖角', category: 'smoothness' },
  { id: 'boundedAbove', text: '它的函数值有上界吗？', meaning: '整个定义域上有有限上界，不要求取到', category: 'range' },
  { id: 'boundedBelow', text: '它的函数值有下界吗？', meaning: '整个定义域上有有限下界，不要求取到', category: 'range' },
  { id: 'hasMaximum', text: '它有全局最大值吗？', meaning: '在整个定义域上有取到的最大值', category: 'extremum' },
  { id: 'continuous', text: '它在自己的定义域内处处连续吗？', meaning: '在自身定义域的每一点连续，定义域外的断点不算', category: 'continuity' }
];
const allFacts = (yes) => Object.fromEntries(QUESTIONS.map(q => [q.id, yes.includes(q.id)]));
const V = (xmin, xmax, ymin, ymax) => ({ xmin, xmax, ymin, ymax });
const standard = ['allRealDomain', 'continuous', 'hasZero', 'passesOrigin'];
function define(id, difficulty, name, formula, fn, view, yes, clue, hints, explanation, extra = {}) {
  return { id, difficulty, name, formula, fn, view, facts: allFacts(yes), clue, hints, explanation,
    intervals: [[view.xmin, view.xmax]], anchors: [], symbol: '∿', ...extra };
}
export const MODELS = [
  define('linear', 'easy', '上升直线', 'y = x', x => x, V(-3,3,-2,2),
    [...standard,'odd','increasing'], '我不弯腰，也不回头；向右走，就向上走。',
    ['整条图像是一条直线。','从左到右始终上升。','标准模型穿过原点。'],
    '直线向右上方延伸，没有弯曲和转折。斜率与位置不用于区分同类形状。',
    { symbol:'↗', anchors:[[0,0],[1,1]] }),
  define('neg-linear', 'easy', '下降直线', 'y = −x', x => -x, V(-3,3,-2,2),
    [...standard,'odd','decreasing'], '我走得笔直，越往右，位置越低。',
    ['整条图像是一条直线。','从左到右始终下降。','标准模型穿过原点。'],
    '下降方向是这题的关键，整体平移或等比缩放不改变形状判断。',
    { symbol:'↘', anchors:[[0,0],[1,-1]] }),
  define('quadratic', 'easy', '开口向上的抛物线', 'y = x²', x => x*x, V(-2.5,2.5,-.8,4),
    [...standard,'even','hasMinimum','boundedBelow','nonnegative'], '我有一个圆润的谷底，离开它后，两边都往上走。',
    ['左右两边关于一条竖线对称。','谷底圆润，没有尖角。','标准模型的顶点在原点，开口向上。'],
    '需要一个连续、圆润的 U 形。与 V 形不同，谷底逐渐转向。',
    { symbol:'∪', anchors:[[0,0],[-1,1],[1,1]] }),
  define('neg-quadratic', 'easy', '开口向下的抛物线', 'y = −x²', x => -x*x, V(-2.5,2.5,-4,.8),
    [...standard,'even','hasMaximum','boundedAbove'], '我有一个圆润的山顶，离开它后，两边都往下走。',
    ['左右两边对称。','最高处平滑，没有尖角。','标准模型的顶点在原点，开口向下。'],
    '图像像倒扣的碗；开口方向和圆润的顶点是关键。',
    { symbol:'∩', anchors:[[0,0],[-1,-1],[1,-1]] }),
  define('absolute', 'easy', '绝对值函数', 'y = |x|', x => Math.abs(x), V(-3,3,-.7,3),
    [...standard,'even','hasMinimum','boundedBelow','nonnegative','hasCorner'], '两条笔直的路，在尖尖的谷底相遇。',
    ['左右两边对称。','最低处有一个尖角。','标准模型的两条射线在原点相遇。'],
    'V 形由两条直线组成，谷底有尖角，区别于圆润的抛物线。',
    { symbol:'∨', anchors:[[0,0],[-1,1],[1,1]] }),
  define('neg-absolute', 'easy', '倒置绝对值函数', 'y = −|x|', x => -Math.abs(x), V(-3,3,-3,.7),
    [...standard,'even','hasMaximum','boundedAbove','hasCorner'], '两条笔直的坡，在尖尖的山顶相遇。',
    ['左右两边对称。','最高处有一个尖角。','标准模型的两条射线从原点向两侧下降。'],
    '倒 V 形的两侧是直线，尖顶与开口向下缺一不可。',
    { symbol:'∧', anchors:[[0,0],[-1,-1],[1,-1]] }),
  define('cubic', 'easy', '三次函数', 'y = x³', x => x*x*x, V(-1.8,1.8,-3.5,3.5),
    [...standard,'odd','increasing'], '我从左下走向右上，经过中间时，脚步会变平缓。',
    ['是一条连续上升的 S 形曲线。','中间变平，但没有波峰或波谷。','标准模型关于原点中心对称。'],
    '三次函数在原点附近变平，经过原点后仍然上升；不能画成有峰谷的曲线。',
    { symbol:'S', anchors:[[0,0],[-1,-1],[1,1]] }),
  define('sqrt', 'easy', '平方根函数', 'y = √x', Math.sqrt, V(-.6,4,-.5,2.4),
    ['continuous','hasZero','passesOrigin','hasMinimum','boundedBelow','nonnegative','increasing'],
    '我从一个端点出发，向右上方延伸，越走越平。',
    ['图像只有一个起点，没有左半支。','向右延伸时逐渐变平。','标准模型从原点出发，定义域是 x≥0。'],
    '根号曲线有真实端点；对数曲线在竖轴附近则没有端点。',
    { symbol:'√', anchors:[[0,0],[1,1],[4,2]], intervals:[[0,4]] }),
  define('reciprocal', 'medium', '正反比例函数', 'y = 1/x', x => 1/x, V(-4,4,-3,3),
    ['continuous','odd','multipleBranches','verticalAsymptote','horizontalAsymptote'],
    '我分居右上和左下，越接近十字边界，越不肯碰到它。',
    ['两支彼此不连接。','标准模型在第一、第三象限。','两条坐标轴都是渐近线。'],
    '第一、第三象限各有一支。靠近竖轴时变陡，远离竖轴时贴近横轴。',
    { intervals:[[-4,-.01],[.01,4]], anchors:[[1,1],[-1,-1]] }),
  define('neg-reciprocal', 'medium', '负反比例函数', 'y = −1/x', x => -1/x, V(-4,4,-3,3),
    ['continuous','odd','multipleBranches','verticalAsymptote','horizontalAsymptote'],
    '我分居左上和右下，各自靠近十字边界，却从不相接。',
    ['两支彼此不连接。','标准模型在第二、第四象限。','两条坐标轴都是渐近线。'],
    '分支位于左上和右下，和正反比例的分支方向相反。',
    { intervals:[[-4,-.01],[.01,4]], anchors:[[-1,1],[1,-1]] }),
  define('reciprocal-square', 'medium', '反比例平方函数', 'y = 1/x²', x => 1/(x*x), V(-3.5,3.5,-.6,4),
    ['continuous','even','multipleBranches','verticalAsymptote','horizontalAsymptote','nonnegative','boundedBelow'],
    '我在两侧照镜子，向中间靠近时，两边都冲向高处。',
    ['左右对称，有两个不相接的分支。','两支都在横轴上方。','靠近竖轴向上冲，远处贴近横轴。'],
    '两支同时朝上，不要在中间连接成 U；函数趋近零但取不到零，也没有最小值。',
    { intervals:[[-3.5,-.01],[.01,3.5]], anchors:[[-1,1],[1,1]] }),
  define('exponential', 'medium', '指数增长函数', 'y = 2ˣ', x => 2**x, V(-4,2.3,-.5,5),
    ['continuous','allRealDomain','increasing','nonnegative','boundedBelow','horizontalAsymptote'],
    '我起初贴着低处轻轻走，后来上升得越来越急。',
    ['整条图像在横轴上方。','越往右，坡越陡。','标准模型经过 (0,1)，向左贴近横轴。'],
    '指数增长没有端点，左侧逐渐变平，右侧越来越陡；不经过原点。',
    { anchors:[[0,1],[1,2],[-1,.5]] }),
  define('decay', 'medium', '指数衰减函数', 'y = 2⁻ˣ', x => 2**(-x), V(-2.3,4,-.5,5),
    ['continuous','allRealDomain','decreasing','nonnegative','boundedBelow','horizontalAsymptote'],
    '我从高处下降，越往右，越像轻轻贴着一条水平线。',
    ['整条图像在横轴上方。','向右下降，但逐渐变平。','标准模型经过 (0,1)，向右贴近横轴。'],
    '下降后逐渐变平是关键，不能画成越下降越陡的曲线。',
    { anchors:[[0,1],[-1,2],[1,.5]] }),
  define('log', 'medium', '自然对数函数', 'y = ln x', Math.log, V(-.6,4,-3,2),
    ['continuous','increasing','hasZero','verticalAsymptote'],
    '我的左边没有起点，只有一道不能碰的竖直边界；向右越走越平。',
    ['定义域是 x>0，但函数值可以为负。','向右一直上升，逐渐变平。','标准模型经过 (1,0)，竖轴是渐近线。'],
    '靠近竖轴时向下延伸，没有根号函数那样的起点。',
    { intervals:[[.001,4]], anchors:[[1,0],[Math.E,1]] }),
  define('sine', 'medium', '正弦波形', 'y = sin x', Math.sin, V(-2*Math.PI,2*Math.PI,-1.8,1.8),
    [...standard,'odd','periodic','hasMinimum','hasMaximum','boundedAbove','boundedBelow'],
    '我的峰谷等高、间距相同，走过一段，还会重复同样的旅程。',
    ['是一条平滑的周期波浪。','波峰和波谷围绕中线交替出现。','标准模型在原点向上穿过横轴。'],
    '正弦和余弦在平移后形状相同，因此形状分共同认可；坐标奖励仍按本题标准模型评价。',
    { peers:['cosine'], anchors:[[0,0],[Math.PI/2,1],[-Math.PI/2,-1]] }),
  define('cosine', 'medium', '余弦波形', 'y = cos x', Math.cos, V(-2*Math.PI,2*Math.PI,-1.8,1.8),
    ['allRealDomain','continuous','even','hasZero','periodic','hasMinimum','hasMaximum','boundedAbove','boundedBelow'],
    '我是一条重复的平滑波浪，这次把山顶留在了中间。',
    ['波峰和波谷围绕中线交替出现。','标准模型左右对称。','标准模型在 (0,1) 达到一个波峰。'],
    '平移后的正弦波也认可为同类形状；坐标奖励检查本题的标准相位。',
    { peers:['sine'], anchors:[[0,1],[Math.PI/2,0],[-Math.PI/2,0]] }),
  define('tan', 'hard', '正切函数', 'y = tan x', Math.tan, V(-4.4,4.4,-3,3),
    ['continuous','odd','hasZero','passesOrigin','periodic','multipleBranches','verticalAsymptote'],
    '我反复向上穿行，每一段都在两道竖直边界之间走向无穷。',
    ['图像由重复的不相接分支组成。','每一支都从左下升向右上。','标准模型关于原点中心对称，周期为 π。'],
    '正切有无穷多个分支；本题显示中央三个。分支靠近竖直渐近线，不能连成普通正弦波。',
    { intervals:[[-4.4,-Math.PI/2-.001],[-Math.PI/2+.001,Math.PI/2-.001],[Math.PI/2+.001,4.4]], anchors:[[0,0],[Math.PI,0],[-Math.PI,0]] }),
  define('abs-sine', 'hard', '正弦的绝对值', 'y = |sin x|', x => Math.abs(Math.sin(x)), V(-2*Math.PI,2*Math.PI,-.4,1.5),
    [...standard,'even','periodic','hasMinimum','hasMaximum','boundedAbove','boundedBelow','nonnegative','hasCorner'],
    '一串圆拱排成一行，每次碰到地面，就折返回上方。',
    ['各个拱形等高，并且周期性重复。','整条图像不在横轴下方。','谷底有尖角，是正弦负半波向上翻折的结果。'],
    '每个谷底落在横轴上且有尖角，波峰仍然圆润。',
    { anchors:[[0,0],[Math.PI/2,1],[Math.PI,0]] }),
  define('abs-log', 'hard', '对数的绝对值', 'y = |ln x|', x => Math.abs(Math.log(x)), V(-.6,4,-.5,3),
    ['continuous','hasZero','hasMinimum','boundedBelow','nonnegative','hasCorner','verticalAsymptote'],
    '我只有右侧的一条连续曲线：先从高处落进尖谷，再缓缓上升。',
    ['定义域是 x>0，只有一个连通分支。','左边靠近竖轴时向上冲，右边缓慢上升。','在 (1,0) 形成尖角最低点。'],
    '它只有一条连通曲线，竖直渐近线是 x=0；左右两侧并不对称。',
    { intervals:[[.001,4]], anchors:[[1,0],[Math.E,1]] }),
  define('abs-quadratic-shift', 'hard', '二次式的绝对值', 'y = |x² − 1|', x => Math.abs(x*x-1), V(-2.2,2.2,-.4,3.5),
    ['allRealDomain','continuous','even','hasZero','hasMinimum','boundedBelow','nonnegative','hasCorner'],
    '我有两处尖谷，谷间拱起一座圆丘，外侧则继续向上。',
    ['左右对称，整体像一个弯曲的 W。','有两个尖角最低点，中间是圆润的小峰。','标准模型在 x=−1 和 x=1 处碰到横轴。'],
    '两处尖谷与中间圆峰都应出现，不能只画普通抛物线或直线 W。',
    { symbol:'W', anchors:[[-1,0],[1,0],[0,1]] }),
  define('cubic-turns', 'hard', '带峰谷的三次函数', 'y = x³ − x', x => x*x*x-x, V(-1.7,1.7,-2.5,2.5),
    [...standard,'odd'],
    '我从左下走到右上，途中先爬过一座小峰，再绕过一处小谷。',
    ['整体是带两个转折的 S 形。','标准模型关于原点中心对称。','标准模型有三个零点：−1、0、1。'],
    '与单调三次函数相比，中间必须出现一次小峰和一次小谷。',
    { symbol:'S', anchors:[[-1,0],[0,0],[1,0]] }),
  define('sum-reciprocal', 'hard', '直线与反比例之和', 'y = x + 1/x', x => x+1/x, V(-3,3,-5,5),
    ['continuous','odd','multipleBranches','verticalAsymptote'],
    '我分成两支，一支悬在上方、一支落在下方；近处和远处都向各自的高低处伸去。',
    ['右支有谷底，左支有峰顶，两支均不碰横轴。','标准模型关于原点中心对称。','竖直渐近线是 x=0，斜渐近线是 y=x。'],
    '右支在 (1,2) 有局部最小值，左支在 (−1,−2) 有局部最大值；整个定义域没有全局最大或最小值。',
    { intervals:[[-3,-.001],[.001,3]], anchors:[[1,2],[-1,-2]] }),
  define('minus-reciprocal', 'hard', '直线与反比例之差', 'y = x − 1/x', x => x-1/x, V(-3,3,-5,5),
    ['continuous','odd','hasZero','multipleBranches','verticalAsymptote'],
    '我有两条分开的上升曲线，各穿过一次横轴，靠近中间时冲向相反的无穷。',
    ['每个分支各自严格递增，但跨过零点后的整个定义域并非严格递增。','两个零点分别是 −1 和 1。','远处靠近斜线 y=x，竖直渐近线是 x=0。'],
    '每支都上升，和 x+1/x 的峰谷不同；两支不能连在一起。',
    { intervals:[[-3,-.001],[.001,3]], anchors:[[-1,0],[1,0]] }),
  define('piecewise', 'hard', '左弯右直的分段函数', 'y = x² (x<0)；y = x (x≥0)', x => x<0?x*x:x, V(-2.2,3,-.6,4),
    [...standard,'hasMinimum','boundedBelow','nonnegative','hasCorner'],
    '我在谷底换了一种走法：左边是弯曲的坡，右边是一条直路，交接处没有断开。',
    ['图像连续，但左右两侧形状不同。','左侧弯曲下降，右侧沿直线上升。','标准模型在原点相接，但两侧斜率不同。'],
    '左半支是抛物线，右半支是上升直线。连接处连续但有尖角，并不左右对称。',
    { anchors:[[0,0],[-1,1],[1,1]] })
];
export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m,i) => { m.number=i+1; return [m.id,m]; }));
export const DIFFICULTY_NAMES = { easy:'简单', medium:'进阶', hard:'挑战' };
export function toPixel(model, x, y, width=1000, height=610) {
  const v=model.view;
  return {x:(x-v.xmin)/(v.xmax-v.xmin)*width, y:(v.ymax-y)/(v.ymax-v.ymin)*height};
}
// Clip at viewport edges rather than clamping entire tails into false horizontal lines.
export function referenceStrokes(model, width=1000, height=610) {
  const strokes=[]; const {ymin,ymax}=model.view;
  for (const [left,right] of model.intervals) {
    let stroke=[], prev=null;
    const flush=()=>{if(stroke.length>1)strokes.push(stroke);stroke=[];};
    for(let i=0;i<=900;i++){
      const x=left+(right-left)*i/900, y=model.fn(x), p={x,y};
      const inside=Number.isFinite(y)&&y>=ymin&&y<=ymax;
      if(inside){
        if(prev&&Number.isFinite(prev.y)&&(prev.y<ymin||prev.y>ymax)){
          const edge=prev.y<ymin?ymin:ymax, t=(edge-prev.y)/(y-prev.y);
          stroke.push(toPixel(model,prev.x+(x-prev.x)*t,edge,width,height));
        }
        stroke.push(toPixel(model,x,y,width,height));
      }else if(prev&&prev.y>=ymin&&prev.y<=ymax&&Number.isFinite(y)){
        const edge=y<ymin?ymin:ymax, t=(edge-prev.y)/(y-prev.y);
        stroke.push(toPixel(model,prev.x+(x-prev.x)*t,edge,width,height));flush();
      }else if(stroke.length)flush();
      prev=p;
    }
    flush();
  }
  return strokes;
}
