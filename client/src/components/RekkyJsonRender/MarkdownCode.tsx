import React, { memo } from 'react';
import { code as StandardCode } from '~/components/Chat/Messages/Content/MarkdownComponents';
import RekkyJsonRenderer from './RekkyJsonRenderer';
import { parseRekkyJsonRenderSpec } from './spec';

type MarkdownCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

function codeText(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === 'string' ? child : '')).join('');
  }
  return '';
}

function isRekkyJsonRenderBlock(className?: string): boolean {
  return Boolean(
    className?.includes('language-rekky-ui') ||
      className?.includes('language-rekky-json') ||
      className?.includes('language-json-render'),
  );
}

const RekkyJsonMarkdownCode: React.ElementType = memo(function RekkyJsonMarkdownCode({
  inline,
  className,
  children,
}: MarkdownCodeProps) {
  if (inline || !isRekkyJsonRenderBlock(className)) {
    return (
      <StandardCode inline={inline} className={className}>
        {children}
      </StandardCode>
    );
  }

  const result = parseRekkyJsonRenderSpec(codeText(children));
  if (!result.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Invalid Rekky widget omitted.', result.error, result.issues);
    }
    return null;
  }

  return <RekkyJsonRenderer spec={result.spec} />;
});

RekkyJsonMarkdownCode.displayName = 'RekkyJsonMarkdownCode';

export default RekkyJsonMarkdownCode;
