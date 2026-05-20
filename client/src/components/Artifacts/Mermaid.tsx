import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { artifactFlowchartConfig } from '~/utils/mermaid';

interface MermaidDiagramProps {
  content: string;
  isDarkMode?: boolean;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ content, isDarkMode = true }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkMode ? 'dark' : 'neutral',
      securityLevel: 'sandbox',
      flowchart: artifactFlowchartConfig,
    });

    const renderDiagram = async () => {
      if (!mermaidRef.current) {
        return;
      }

      try {
        const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, content);
        mermaidRef.current.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        mermaidRef.current.innerHTML = 'Error rendering diagram';
      }
    };

    renderDiagram();
  }, [content, isDarkMode]);

  return (
    <div className="h-full w-full overflow-auto p-5" style={{ backgroundColor: isDarkMode ? '#212121' : '#fff' }}>
      <div ref={mermaidRef} className="min-h-full min-w-full" />
    </div>
  );
};

export default MermaidDiagram;
