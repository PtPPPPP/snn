import { ArrowDownRight } from "./icons";

export function JoinSection() {
  return (
    <section className="section section-join" id="join">
      <div className="join-main">
        <p className="eyebrow">JOIN THE NETWORK / 04</p>
        <h2>想学点东西？<br />来和我们一起做。</h2>
        <p className="join-intro">
          不管你刚写出第一个程序，还是已经在做机器人、算法或产品项目，
          只要愿意学习、愿意交流、愿意动手，SNN 都欢迎你。
        </p>
        <div className="join-status" aria-label="公众号状态">
          <span className="pulse" aria-hidden="true" />
          SNN 社团公众号已上线
        </div>
        <p className="join-placeholder">
          扫描二维码关注公众号，获取活动预告、项目进展和招新信息。
        </p>
      </div>
      <div className="wechat-card" id="join-steps">
        <div className="wechat-card-head">
          <span>WECHAT / 公众号</span>
          <span className="wechat-card-scan">
            SCAN TO FOLLOW <ArrowDownRight className="wechat-card-scan-icon" />
          </span>
        </div>
        <div className="wechat-qr-wrap">
          <img
            src="/assets/snn-wechat.jpg"
            alt="SNN 社团公众号二维码"
            width={430}
            height={430}
          />
          <span className="corner corner-a" aria-hidden="true" />
          <span className="corner corner-b" aria-hidden="true" />
        </div>
        <div className="wechat-card-foot">
          <strong>SNN 社团</strong>
          <span>活动 · 项目 · 招募</span>
        </div>
      </div>
    </section>
  );
}
