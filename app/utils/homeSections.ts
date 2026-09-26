export const HOME_SECTION_IDS = [
  'home',
  'cases',
  'services',
  'project-formats',
  'about',
  'contact',
] as const

export type HomeSectionId = typeof HOME_SECTION_IDS[number]

export function isHomeSectionId(value: string): value is HomeSectionId {
  return (HOME_SECTION_IDS as readonly string[]).includes(value)
}
