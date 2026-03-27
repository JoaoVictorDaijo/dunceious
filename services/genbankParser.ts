import { SeqRecord, BioFeature, FeatureSegment } from '../types';

export const parseGenBank = (content: string): SeqRecord[] => {
  const records: SeqRecord[] = [];
  // Divide o conteúdo por cada registro (finalizado por //)
  const recordStrings = content.split(/\r?\n\/\/\s*(?:\r?\n|$)/);

  for (const recordStr of recordStrings) {
    if (!recordStr.trim()) continue;

    const lines = recordStr.split(/\r?\n/);
    let id = 'Unknown';
    let name = 'Unknown';
    let definition = '';
    let sequence = '';
    let isCircular = false;
    const features: BioFeature[] = [];
    let isSequence = false;
    let inFeaturesSection = false;

    // Helper para extrair segmentos respeitando a ordem do arquivo (essencial para circularidade)
    const parseLocation = (loc: string): { segments: FeatureSegment[], strand: 1 | -1, start: number, end: number } => {
      // Remove fuzzy indicators and spaces
      const cleanLoc = loc.replace(/[<>\s]/g, '');
      
      const isComplement = cleanLoc.includes('complement');
      const strand: 1 | -1 = isComplement ? -1 : 1;
      
      const segments: FeatureSegment[] = [];
      
      // Encontra todos os padrões de coordenadas (ex: 2427..3323, 123^124, 123)
      const regex = /(\d+)(?:\.\.|\^)(\d+)|(\d+)/g;
      let match;
      while ((match = regex.exec(cleanLoc)) !== null) {
        if (match[1] && match[2]) {
          segments.push({ start: parseInt(match[1]) - 1, end: parseInt(match[2]) });
        } else if (match[3]) {
          const val = parseInt(match[3]);
          segments.push({ start: val - 1, end: val });
        }
      }

      let start = 0;
      let end = 0;

      if (segments.length > 0) {
        const firstStart = segments[0].start;
        const lastEnd = segments[segments.length - 1].end;
        
        // Circularity check: if first segment starts after last segment ends
        // (e.g., join(2426..3323, 1..1758))
        if (segments.length > 1 && firstStart > lastEnd) {
          start = firstStart;
          end = lastEnd;
        } else {
          // Linear case: envelope is min start and max end
          start = Math.min(...segments.map(s => s.start));
          end = Math.max(...segments.map(s => s.end));
        }
      }

      return { segments, strand, start, end };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // 1. Cabeçalho
      if (line.startsWith('LOCUS')) {
        const parts = line.split(/\s+/);
        id = parts[1] || 'Unknown';
        name = id;
        isCircular = line.toLowerCase().includes('circular');
        continue;
      }

      if (line.startsWith('DEFINITION')) {
        definition = line.substring(12).trim();
        // Accumulate multi-line definition
        while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(12))) {
          definition += ' ' + lines[++i].trim();
        }
        name = definition.length > 30 ? definition.substring(0, 27) + '...' : definition;
        continue;
      }

      if (line.startsWith('SOURCE')) {
        const source = line.substring(12).trim();
        if (!definition) name = source;
        continue;
      }

      // 2. Seções
      if (line.startsWith('FEATURES')) {
        inFeaturesSection = true;
        continue;
      }
      if (line.startsWith('ORIGIN')) {
        inFeaturesSection = false;
        isSequence = true;
        continue;
      }

      // 3. Processamento de Sequência
      if (isSequence) {
        sequence += line.replace(/[\d\s]/g, '').toUpperCase();
        continue;
      }

      // 4. Processamento de Features
      if (inFeaturesSection) {
        const featureMatch = line.match(/^ {5}(\w+) +(.+)$/);
        
        if (featureMatch) {
          const [, type, initialLoc] = featureMatch;
          let fullLocation = initialLoc.trim();

          // Acumula localização multilinha (ex: join muito longo)
          while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21)) && !lines[i+1].trim().startsWith('/')) {
            fullLocation += lines[++i].trim();
          }

          const { segments, strand, start, end } = parseLocation(fullLocation);
          
          const currentFeature: BioFeature = {
            type,
            name: type,
            start, 
            end,   
            strand,
            segments,
            locationString: fullLocation,
            metadata: {}
          };

          // Processa qualificadores desta feature (ex: /gene, /translation)
          while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21))) {
            i++;
            const qualLine = lines[i].trim();
            
            if (qualLine.startsWith('/')) {
              const qualMatch = qualLine.match(/^\/(\w+)(?:=(.*))?$/);
              if (qualMatch) {
                const [, key, value] = qualMatch;
                let valContent = value ? value.replace(/^"|"$/g, '') : '';

                // Acumula valor do qualificador se ele quebrar linha (comum em /translation)
                while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21)) && !lines[i+1].trim().startsWith('/')) {
                  valContent += lines[++i].trim().replace(/"/g, '');
                }

                if (['gene', 'product', 'label', 'locus_tag'].includes(key)) {
                  currentFeature.name = valContent;
                }
                if (key === 'translation') {
                  currentFeature.translation = valContent;
                }
                currentFeature.metadata![key] = valContent;
              }
            }
          }
          features.push(currentFeature);
        }
      }
    }
    records.push({ id, name, definition, sequence, features, isCircular });
  }

  return records;
};
