import { ArrowDownRight } from "./icons";

export function JoinSection() {
  return (
    <section className="section section-join" id="join">
      <div className="join-main">
        <p className="eyebrow">JOIN THE NETWORK / 04</p>
        <h2>Start before you feel ready. Pick a role.</h2>
        <p className="join-intro">
          Whether you just wrote your first program or are already building
          robots, algorithms, or products — if you like to learn, collaborate,
          and ship, you belong here.
        </p>
        <div className="join-status" aria-label="WeChat status">
          <span className="pulse" aria-hidden="true" />
          SNN WeChat Official Account is live
        </div>
        <p className="join-placeholder">
          Follow the QR code for event updates, project progress, and recruitment.
        </p>
      </div>
      <div className="wechat-card" id="join-steps">
        <div className="wechat-card-head">
          <span>WECHAT</span>
          <span className="wechat-card-scan">
            SCAN TO FOLLOW <ArrowDownRight className="wechat-card-scan-icon" />
          </span>
        </div>
        <div className="wechat-qr-wrap">
          <img
            src="/assets/snn-wechat.jpg"
            alt="SNN WeChat QR code — 二维码"
            width={430}
            height={430}
          />
          <span className="corner corner-a" aria-hidden="true" />
          <span className="corner corner-b" aria-hidden="true" />
        </div>
        <div className="wechat-card-foot">
          <strong>SNN</strong>
          <span>Events · Projects · Recruitment</span>
        </div>
      </div>
    </section>
  );
}
