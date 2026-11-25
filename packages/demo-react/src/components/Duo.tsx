import type { ReactNode } from 'react'
import { ui } from '@genoacms/demo-support/ui'
import { idOf } from './site'

interface ColumnProps { eyebrow: string, heading: string, intro: string, content: ReactNode }

const Column = ({ eyebrow, heading, intro, content }: ColumnProps): ReactNode =>
  <div className={ui.duoColumn}>
    {eyebrow !== '' && <p className={ui.eyebrow}>{eyebrow}</p>}
    <h2 className={ui.duoHeading}>{heading}</h2>
    {intro !== '' && <p className={ui.duoIntro}>{intro}</p>}
    <div className={ui.content}>{content}</div>
  </div>

interface DuoProps {
  anchor: string
  startEyebrow: string, startHeading: string, startIntro: string, start: ReactNode
  endEyebrow: string, endHeading: string, endIntro: string, end: ReactNode
}

const Duo = (props: DuoProps): ReactNode =>
  <section className={ui.section} id={idOf(props.anchor)}>
    <div className={ui.duoGrid}>
      <Column eyebrow={props.startEyebrow} heading={props.startHeading} intro={props.startIntro} content={props.start} />
      <Column eyebrow={props.endEyebrow} heading={props.endHeading} intro={props.endIntro} content={props.end} />
    </div>
  </section>

export { Duo }
