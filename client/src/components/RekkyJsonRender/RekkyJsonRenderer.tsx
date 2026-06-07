import React from 'react';
import { useLocalize } from '~/hooks';
import type {
  ChecklistProps,
  ComparisonGridProps,
  IngredientSwapTableProps,
  MetricRowProps,
  RekkyJsonRenderElement,
  RekkyJsonRenderSpec,
} from './types';

type RekkyJsonRendererProps = {
  spec: RekkyJsonRenderSpec;
};

function MetricRow({ items }: MetricRowProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="rekky-metric-row">
      {items.map((item) => (
        <div
          key={`${item.label}:${item.value}`}
          className="bg-surface-primary/70 rounded-lg border border-border-light px-3 py-2"
        >
          <div className="rekky-meta text-text-secondary">{item.label}</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function IngredientSwapTable({ title, rows }: IngredientSwapTableProps) {
  const localize = useLocalize();

  return (
    <div
      className="overflow-hidden rounded-lg border border-border-light"
      data-testid="rekky-swap-table"
    >
      {title ? (
        <div className="border-b border-border-light px-4 py-3 text-sm font-semibold text-text-primary">
          {title}
        </div>
      ) : null}
      <div className="divide-y divide-border-light">
        {rows.map((row) => (
          <div
            key={`${row.ingredient}:${row.swap}`}
            className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[0.85fr_0.85fr_1.3fr]"
          >
            <div>
              <div className="rekky-meta text-text-secondary">
                {localize('com_rekky_widget_instead_of')}
              </div>
              <div className="mt-1 font-medium text-text-primary">{row.ingredient}</div>
            </div>
            <div>
              <div className="rekky-meta text-text-secondary">
                {localize('com_rekky_widget_use')}
              </div>
              <div className="mt-1 font-medium text-text-primary">{row.swap}</div>
            </div>
            <p className="leading-6 text-text-secondary">{row.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checklist({ title, items }: ChecklistProps) {
  return (
    <div className="rounded-lg border border-border-light px-4 py-3" data-testid="rekky-checklist">
      {title ? <div className="mb-2 text-sm font-semibold text-text-primary">{title}</div> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-text-secondary">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-surface-submit" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonGrid({ title, columns }: ComparisonGridProps) {
  return (
    <div
      className="rounded-lg border border-border-light px-4 py-3"
      data-testid="rekky-comparison-grid"
    >
      {title ? <div className="mb-3 text-sm font-semibold text-text-primary">{title}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map((column) => (
          <div key={column.label}>
            <div className="rekky-meta text-text-secondary">{column.label}</div>
            <p className="mt-1 text-sm leading-6 text-text-primary">{column.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderElement(
  element: RekkyJsonRenderElement,
  children: React.ReactNode,
): React.ReactElement {
  let renderedElement: React.ReactElement;
  if (element.type === 'MetricRow') {
    renderedElement = <MetricRow {...element.props} />;
  } else if (element.type === 'IngredientSwapTable') {
    renderedElement = <IngredientSwapTable {...element.props} />;
  } else if (element.type === 'Checklist') {
    renderedElement = <Checklist {...element.props} />;
  } else {
    renderedElement = <ComparisonGrid {...element.props} />;
  }

  return (
    <>
      {renderedElement}
      {children}
    </>
  );
}

export default function RekkyJsonRenderer({ spec }: RekkyJsonRendererProps) {
  const renderNode = (key: string, visited: Set<string>): React.ReactNode => {
    if (visited.has(key)) {
      return null;
    }
    const element = spec.elements[key];
    if (!element) {
      return null;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(key);
    const childNodes = element.children.map((childKey) => (
      <React.Fragment key={childKey}>{renderNode(childKey, nextVisited)}</React.Fragment>
    ));
    return <React.Fragment key={key}>{renderElement(element, childNodes)}</React.Fragment>;
  };

  return (
    <div className="rekky-ui my-5 space-y-3" data-testid="rekky-json-render">
      {renderNode(spec.root, new Set())}
    </div>
  );
}
