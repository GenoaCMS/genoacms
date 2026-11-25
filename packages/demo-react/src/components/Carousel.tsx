import { useRef, type CSSProperties, type ReactNode } from 'react'
import { perViewOf, turnCarousel } from '@genoacms/demo-support/site'
import { slideBasisOf, ui } from '@genoacms/demo-support/ui'

const Carousel = ({ label, perView, items }: { label: string, perView: number, items: ReactNode }): ReactNode => {
  const track = useRef<HTMLDivElement | null>(null)

  return (
    <div className={ui.carousel} role="region" aria-roledescription="carousel" aria-label={label}>
      <div className={ui.carouselTrack} ref={track} style={{ '--slide-basis': slideBasisOf(perViewOf(perView)) } as CSSProperties}>{items}</div>
      <div className={ui.carouselControls}>
        <button className={ui.carouselButton} type="button" aria-label="Previous" onClick={() => turnCarousel(track.current, -1)}>‹</button>
        <button className={ui.carouselButton} type="button" aria-label="Next" onClick={() => turnCarousel(track.current, 1)}>›</button>
      </div>
    </div>
  )
}

export { Carousel }
