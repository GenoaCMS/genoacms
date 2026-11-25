import { useEffect, useRef, type ReactNode } from 'react'
import { ui } from '@genoacms/demo-support/ui'
import { galaxy } from '../galaxy'
import { idOf } from './site'

interface GalaxySectionProps { anchor: string, eyebrow: string, heading: string, intro: string, content: ReactNode }

const GalaxySection = ({ anchor, eyebrow, heading, intro, content }: GalaxySectionProps): ReactNode => {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => canvas.current === null ? undefined : galaxy.mount(canvas.current), [])

  return (
    <section className={ui.galaxy} id={idOf(anchor)}>
      <div className={ui.galaxyHead}>
        {eyebrow !== '' && <p className={ui.eyebrow}>{eyebrow}</p>}
        <h2 className={ui.heading}>{heading}</h2>
        {intro !== '' && <p className={ui.intro}>{intro}</p>}
      </div>
      <div className={ui.galaxyStage}>
        <canvas className={ui.galaxyCanvas} ref={canvas} />
        <div className={ui.galaxyOverlay}>{content}</div>
      </div>
    </section>
  )
}

export { GalaxySection }
