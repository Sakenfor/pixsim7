export type DocVisibility = 'public' | 'internal' | 'admin';

export interface DocFrontMatter {
  id?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  featureIds?: string[];
  visibility?: DocVisibility;
}

export type DocLinkKind = 'doc' | 'code' | 'external' | 'anchor';

export interface DocLink {
  href: string;
  kind: DocLinkKind;
  resolvedPath?: string;
  title?: string;
  anchor?: string;
}

export interface DocIndexEntry {
  id: string;
  path: string;
  title: string;
  summary?: string;
  tags?: string[];
  featureIds?: string[];
  visibility?: DocVisibility;
  origin?: string;
  links?: DocLink[];
  backlinks?: string[];
  updatedAt?: string;
}

export interface DocPageResponse {
  path: string;
  title: string;
  summary?: string;
  frontMatter?: DocFrontMatter;
  visibility?: DocVisibility;
  ast: DocAstNode[];
  links?: DocLink[];
  backlinks?: string[];
  markdown?: string;
}

// AST types (Mistune AST compatible)
export interface DocAstBase {
  type: string;
  children?: DocAstNode[];
}

export interface DocAstText extends DocAstBase {
  type: 'text';
  text: string;
}

export interface DocAstHeading extends DocAstBase {
  type: 'heading';
  level: number;
  children: DocAstNode[];
}

export interface DocAstParagraph extends DocAstBase {
  type: 'paragraph';
  children: DocAstNode[];
}

export interface DocAstStrong extends DocAstBase {
  type: 'strong';
  children: DocAstNode[];
}

export interface DocAstEmphasis extends DocAstBase {
  type: 'emphasis';
  children: DocAstNode[];
}

export interface DocAstCodeSpan extends DocAstBase {
  type: 'codespan';
  text: string;
}

export interface DocAstLineBreak extends DocAstBase {
  type: 'linebreak' | 'softbreak';
}

export interface DocAstLink extends DocAstBase {
  type: 'link';
  link: string;
  title?: string;
  children: DocAstNode[];
}

export interface DocAstImage extends DocAstBase {
  type: 'image';
  src: string;
  alt?: string;
  title?: string;
}

export interface DocAstBlockCode extends DocAstBase {
  type: 'block_code';
  text: string;
  info?: string;
  lang?: string;
}

export interface DocAstBlockQuote extends DocAstBase {
  type: 'block_quote';
  children: DocAstNode[];
}

export interface DocAstThematicBreak extends DocAstBase {
  type: 'thematic_break';
}

export interface DocAstList extends DocAstBase {
  type: 'list';
  ordered?: boolean;
  start?: number;
  tight?: boolean;
  children: DocAstNode[];
}

export interface DocAstListItem extends DocAstBase {
  type: 'list_item';
  children: DocAstNode[];
}

export interface DocAstTable extends DocAstBase {
  type: 'table';
  children: DocAstNode[];
}

export interface DocAstTableHead extends DocAstBase {
  type: 'table_head';
  children: DocAstNode[];
}

export interface DocAstTableBody extends DocAstBase {
  type: 'table_body';
  children: DocAstNode[];
}

export interface DocAstTableRow extends DocAstBase {
  type: 'table_row';
  children: DocAstNode[];
}

export interface DocAstTableCell extends DocAstBase {
  type: 'table_cell';
  align?: string;
  children: DocAstNode[];
}

export interface DocAstUnknown extends DocAstBase {
  type: string;
  [key: string]: unknown;
}

export type DocAstNode =
  | DocAstText
  | DocAstHeading
  | DocAstParagraph
  | DocAstStrong
  | DocAstEmphasis
  | DocAstCodeSpan
  | DocAstLineBreak
  | DocAstLink
  | DocAstImage
  | DocAstBlockCode
  | DocAstBlockQuote
  | DocAstThematicBreak
  | DocAstList
  | DocAstListItem
  | DocAstTable
  | DocAstTableHead
  | DocAstTableBody
  | DocAstTableRow
  | DocAstTableCell
  | DocAstUnknown;
