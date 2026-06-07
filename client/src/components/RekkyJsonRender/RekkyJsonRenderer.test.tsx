import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import RekkyJsonRenderer from './RekkyJsonRenderer';
import { parseRekkyJsonRenderSpec } from './spec';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const metricSpec = {
  root: 'metrics',
  elements: {
    metrics: {
      type: 'MetricRow',
      props: {
        items: [
          { label: 'Total', value: '35 min' },
          { label: 'Yield', value: '2 portions' },
        ],
      },
      children: [],
    },
  },
};

describe('RekkyJsonRenderer', () => {
  test('renders a valid json-render metric spec', () => {
    const result = parseRekkyJsonRenderSpec(JSON.stringify(metricSpec));

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    render(<RekkyJsonRenderer spec={result.spec} />);

    const widget = screen.getByTestId('rekky-json-render');
    expect(within(widget).getByText('Total')).toBeInTheDocument();
    expect(within(widget).getByText('35 min')).toBeInTheDocument();
    expect(within(widget).getByText('Yield')).toBeInTheDocument();
    expect(within(widget).getByText('2 portions')).toBeInTheDocument();
  });

  test('renders child widgets from the flat spec tree', () => {
    const result = parseRekkyJsonRenderSpec(
      JSON.stringify({
        root: 'metrics',
        elements: {
          metrics: {
            type: 'MetricRow',
            props: {
              items: [{ label: 'Total', value: '35 min' }],
            },
            children: ['checklist'],
          },
          checklist: {
            type: 'Checklist',
            props: {
              title: 'Before you start',
              items: ['Salt the yogurt', 'Warm the skillet'],
            },
            children: [],
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    render(<RekkyJsonRenderer spec={result.spec} />);

    expect(screen.getByText('35 min')).toBeInTheDocument();
    expect(screen.getByText('Before you start')).toBeInTheDocument();
    expect(screen.getByText('Warm the skillet')).toBeInTheDocument();
  });

  test('renders a single-widget shorthand spec', () => {
    const result = parseRekkyJsonRenderSpec(
      JSON.stringify({
        type: 'Checklist',
        props: {
          title: 'Before you start',
          items: ['Warm the skillet', 'Slice mushrooms'],
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    render(<RekkyJsonRenderer spec={result.spec} />);

    expect(screen.getByText('Before you start')).toBeInTheDocument();
    expect(screen.getByText('Warm the skillet')).toBeInTheDocument();
  });

  test('rejects components outside the Rekky catalog', () => {
    const result = parseRekkyJsonRenderSpec(
      JSON.stringify({
        root: 'bad',
        elements: {
          bad: {
            type: 'Card',
            props: { title: 'Nope' },
            children: [],
          },
        },
      }),
    );

    expect(result.success).toBe(false);
  });
});
