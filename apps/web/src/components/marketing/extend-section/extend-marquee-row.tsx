import { useRef } from "react"
import clsx from "clsx"
import {
  m,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react"

import styles from "./extend-section.module.scss"

const wrapRange = (min: number, max: number, v: number) => {
  const range = max - min
  return min + ((((v - min) % range) + range) % range)
}

// Number of identical tiles per marquee row; the pattern repeats every
// 100 / EXTEND_TILES percent of track width, which is what wrapRange scrubs over.
const EXTEND_TILES = 10

/**
 * One endlessly-drifting row of the "Built to extend." ticker. baseVelocity is
 * percent of track width per second (sign = direction); scroll velocity feeds
 * back into the speed and scrolling up reverses the drift. `offset` starts the
 * row half a tile off-grid so two rows brick instead of stacking.
 */
export function ExtendMarqueeRow({ baseVelocity, offset }: { baseVelocity: number; offset?: boolean }) {
  const baseX = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVelocity = useVelocity(scrollY)
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 })
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], { clamp: false })
  const directionFactor = useRef(1)
  const reduceMotion = useReducedMotion()

  const x = useTransform(baseX, (v) => `${wrapRange(-100 / EXTEND_TILES, 0, v)}%`)

  useAnimationFrame((_, delta) => {
    if (reduceMotion) return
    let moveBy = directionFactor.current * baseVelocity * (delta / 1000)
    if (velocityFactor.get() < 0) {
      directionFactor.current = -1
    } else if (velocityFactor.get() > 0) {
      directionFactor.current = 1
    }
    moveBy += directionFactor.current * moveBy * velocityFactor.get()
    baseX.set(baseX.get() + moveBy)
  })

  const tiles = Array.from({ length: EXTEND_TILES }, (_, i) => <span key={i}>Built to extend.</span>)

  // Two identical tracks sharing one x: a dimmed base plus a full-opacity copy
  // behind a stationary center mask, so the tile passing the middle lights up.
  return (
    <div className={clsx(styles.row, offset && styles.rowOffset)}>
      <m.div className={clsx(styles.track, styles.trackDim)} style={{ x }}>
        {tiles}
      </m.div>
      <div className={styles.spotlight}>
        <m.div className={styles.track} style={{ x }}>
          {tiles}
        </m.div>
      </div>
    </div>
  )
}
