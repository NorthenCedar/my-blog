import {parseAlbumHeader} from './album-source.mjs';
import {validateAlbumFields} from './album-presentation.mjs';
/** 旧展示字段兼容，新字段按需透传。 */
export function readAlbumOptions(frontmatter){
  const fields=parseAlbumHeader(frontmatter);validateAlbumFields(fields);
  const {layout='scatter',titleEn='',cover,presentation}=fields;
  return {layout,titleEn:titleEn.trim(),...(cover===undefined?{}:{cover}),...(presentation===undefined?{}:{presentation})};
}
