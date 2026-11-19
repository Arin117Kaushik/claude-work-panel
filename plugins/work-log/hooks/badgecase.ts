import { BADGE_ART } from './sprites'

// The badge case: the 8 Kanto badges in a row, about the size of an emoji. The first `count` are earned (the real FireRed
// pixel art in full colour), the rest are the same badges faded. Vector pixels, so it stays sharp at any size.
const S = 16
const GAP = 2
const PAD = 1

export const CASE_W = PAD * 2 + 8 * S + 7 * GAP
export const CASE_H = S + PAD * 2

export const badgeCase = (count: number): string => {
  let body = ''
  for (let i = 0; i < 8; i++) {
    const x = PAD + i * (S + GAP)
    body += `<g transform="translate(${x} ${PAD})">${i < count ? BADGE_ART[i] : `<g opacity=".38">${BADGE_ART[i]}</g>`}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CASE_W} ${CASE_H}" shape-rendering="crispEdges">${body}</svg>`
}
