import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LaunchCut | 产品介绍",
  description: "LaunchCut 把产品描述、截图和 Remotion 合成为可复用的发布视频工作流。",
};

const workflow = [
  {
    label: "01",
    title: "输入产品描述",
    copy: "把定位、卖点、目标用户和发布场景写成一段 brief，系统先生成可编辑分镜。",
  },
  {
    label: "02",
    title: "上传真实截图",
    copy: "截图会参与 AI 识别和镜头绑定，让视频来自真实产品，而不是泛泛的营销模板。",
  },
  {
    label: "03",
    title: "确认并渲染 MP4",
    copy: "所有文案、镜头、节奏和素材进入同一份 VideoSpec，再交给 Remotion 输出视频。",
  },
];

const features = [
  "AI 生成 4-7 个可编辑镜头",
  "默认使用 Remotion skill 规则",
  "内置 Vercel 风格设计库",
  "支持本地截图临时上传",
  "生成前可逐镜头修改文案",
  "渲染进度和历史记录可追踪",
];

export default function ProductHomePage() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav" aria-label="产品导航">
        <Link className="marketing-brand" href="/">
          <span className="marketing-mark">LC</span>
          <span>LaunchCut</span>
        </Link>
        <div className="marketing-links">
          <a href="#workflow">工作流</a>
          <a href="#features">能力</a>
          <Link href="/generate">开始生成</Link>
        </div>
      </nav>

      <section className="marketing-hero">
        <Image
          className="marketing-hero-visual"
          src="/assets/launchcut-hero.svg"
          alt="LaunchCut campaign workspace preview"
          fill
          priority
          sizes="100vw"
        />
        <div className="marketing-hero-copy">
          <p className="eyebrow">Product launch videos</p>
          <h1>LaunchCut</h1>
          <p>
            用产品描述和真实截图生成可编辑分镜，再通过 Remotion 渲染成发布视频。它不是一次性剪辑工具，而是一条能反复复用的产品视频生产线。
          </p>
          <div className="marketing-actions">
            <Link className="button" href="/generate">
              开始生成视频
            </Link>
            <Link className="button secondary" href="/studio">
              打开工作台
            </Link>
          </div>
        </div>
      </section>

      <section className="marketing-section" id="workflow">
        <div className="marketing-section-heading">
          <p className="eyebrow">Workflow</p>
          <h2>从产品素材到发布视频，只保留必要步骤</h2>
          <p>LaunchCut 把创意规划、素材绑定、分镜确认和 Remotion 渲染放在同一个工作流里。</p>
        </div>
        <div className="workflow-grid">
          {workflow.map((item) => (
            <article className="marketing-card" key={item.label}>
              <span>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-product-band">
        <div>
          <p className="eyebrow">Preview first</p>
          <h2>先确认视频方案，再消耗渲染时间</h2>
          <p>
            工作台会先给出本地草稿，再等待 AI 结合截图和设计库增强方案。你可以编辑标题、副标题、旁白、短标签和镜头时长。
          </p>
        </div>
        <Image
          src="/assets/launchcut-workflow.svg"
          alt="LaunchCut workflow screenshot"
          width={900}
          height={520}
          className="marketing-product-image"
        />
      </section>

      <section className="marketing-section" id="features">
        <div className="marketing-section-heading">
          <p className="eyebrow">Capabilities</p>
          <h2>为产品团队设计的视频生成能力</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <div className="feature-item" key={feature}>
              {feature}
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-product-band reverse">
        <Image
          src="/assets/launchcut-results.svg"
          alt="LaunchCut render results dashboard"
          width={900}
          height={520}
          className="marketing-product-image"
        />
        <div>
          <p className="eyebrow">Reusable output</p>
          <h2>一次配置，持续产出</h2>
          <p>
            同一份 VideoSpec 可以继续扩展横版、竖版、销售演示或社媒切片。文案和截图更新后，视频生产线不用从零开始。
          </p>
          <Link className="button" href="/generate">
            创建第一条视频
          </Link>
        </div>
      </section>
    </main>
  );
}
