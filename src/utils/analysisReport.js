import { jsPDF } from 'jspdf';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLORS = {
  ink: [31, 41, 55],
  muted: [100, 116, 139],
  accent: [13, 148, 136],
  pale: [240, 253, 250],
  line: [203, 213, 225],
  white: [255, 255, 255]
};

const firstValue = (...values) => values.find((value) => value !== null && value !== undefined);

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const displayNumber = (value, digits = 1, suffix = '') => {
  const number = finiteNumber(value);
  return number === null ? 'Not available' : `${number.toFixed(digits)}${suffix}`;
};

const normalizedCategories = (analysis) => {
  const data = analysis?.raw || analysis || {};
  const transitions = firstValue(
    analysis?.transitionMatrix,
    data?.transitionMatrix,
    data?.transition_matrix,
    data?.landCover?.classes,
    data?.land_cover?.classes
  );

  if (!Array.isArray(transitions)) return [];
  return transitions
    .map((item) => ({
      category: String(item?.category || item?.class || item?.name || '').trim(),
      color: typeof item?.color === 'string' ? item.color : '#0d9488',
      t1: finiteNumber(firstValue(item?.t1Percent, item?.t1_percent, item?.before, item?.t1)),
      t2: finiteNumber(firstValue(item?.t2Percent, item?.t2_percent, item?.after, item?.t2)),
      delta: finiteNumber(firstValue(item?.changePercent, item?.change_percent, item?.delta))
    }))
    .filter((item) => item.category && item.t1 !== null && item.t2 !== null);
};

const loadImage = (src) => new Promise((resolve, reject) => {
  if (!src) {
    reject(new Error('Image data is unavailable.'));
    return;
  }

  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The image could not be loaded for the report.'));
  if (!src.startsWith('data:') && !src.startsWith('blob:')) image.crossOrigin = 'anonymous';
  image.src = src;
});

const imageAsJpeg = async (src, maxSide = 1400) => {
  const image = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare an image for the PDF.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    data: canvas.toDataURL('image/jpeg', 0.88),
    width: image.naturalWidth,
    height: image.naturalHeight
  };
};

const colorForCanvas = (color) => /^#[0-9a-f]{6}$/i.test(color) ? color : '#0d9488';

const createPieChart = (categories, field) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 560;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not render the report chart.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const values = categories.map((item) => ({ ...item, value: Math.max(0, item[field]) }));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return null;

  const centerX = 280;
  const centerY = 280;
  const radius = 205;
  let angle = -Math.PI / 2;

  values.forEach((item) => {
    const endAngle = angle + (item.value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, angle, endAngle);
    context.closePath();
    context.fillStyle = colorForCanvas(item.color);
    context.fill();
    angle = endAngle;
  });

  context.font = 'bold 30px Arial';
  context.fillStyle = '#1f2937';
  context.textAlign = 'center';
  context.fillText(`${total.toFixed(1)}%`, centerX, centerY + 10);

  context.textAlign = 'left';
  context.font = '22px Arial';
  values.forEach((item, index) => {
    const y = 100 + index * 58;
    context.fillStyle = colorForCanvas(item.color);
    context.fillRect(550, y - 18, 24, 24);
    context.fillStyle = '#1f2937';
    context.fillText(item.category.slice(0, 30), 590, y);
    context.textAlign = 'right';
    context.fillText(`${item.value.toFixed(1)}%`, 950, y);
    context.textAlign = 'left';
  });

  return canvas.toDataURL('image/png');
};

const createComparisonChart = (categories) => {
  if (!categories.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1300;
  canvas.height = Math.max(420, 120 + categories.length * 82);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not render the comparison chart.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const plotX = 290;
  const plotWidth = 720;
  const maxValue = Math.max(100, ...categories.flatMap((item) => [item.t1, item.t2]));
  context.font = '22px Arial';

  categories.forEach((item, index) => {
    const y = 70 + index * 82;
    context.fillStyle = '#1f2937';
    context.textAlign = 'right';
    context.fillText(item.category.slice(0, 28), plotX - 20, y + 18);
    const t1Width = Math.max(0, (item.t1 / maxValue) * plotWidth);
    const t2Width = Math.max(0, (item.t2 / maxValue) * plotWidth);
    context.fillStyle = '#0891b2';
    context.fillRect(plotX, y, t1Width, 24);
    context.fillStyle = '#10b981';
    context.fillRect(plotX, y + 30, t2Width, 24);
    context.textAlign = 'left';
    context.fillStyle = '#1f2937';
    context.fillText(`T1 ${item.t1.toFixed(1)}%`, plotX + t1Width + 12, y + 19);
    context.fillText(`T2 ${item.t2.toFixed(1)}%`, plotX + t2Width + 12, y + 49);
  });

  return canvas.toDataURL('image/png');
};

const addWrappedText = (doc, text, x, y, width, fontSize = 10, lineHeight = 5) => {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(String(text), width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
};

const addSectionTitle = (doc, title, y) => {
  doc.setTextColor(...COLORS.accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN, y + 3, PAGE_WIDTH - MARGIN, y + 3);
  doc.setTextColor(...COLORS.ink);
  return y + 12;
};

const addFooter = (doc) => {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.line(MARGIN, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('GeoZenX.ai', MARGIN, PAGE_HEIGHT - 7);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 7, { align: 'right' });
  }
};

const addImagePanel = (doc, { x, y, width, height, title, image, fallback, filename, dimensionText }) => {
  doc.setDrawColor(...COLORS.line);
  doc.setFillColor(...COLORS.white);
  doc.roundedRect(x, y, width, height, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.accent);
  doc.text(title, x + 4, y + 7);

  const box = { x: x + 4, y: y + 12, width: width - 8, height: height - 30 };
  if (image) {
    const ratio = Math.min(box.width / image.width, box.height / image.height);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    doc.addImage(image.data, 'JPEG', box.x + (box.width - drawWidth) / 2, box.y + (box.height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(doc.splitTextToSize(fallback, box.width), box.x, box.y + 12);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.ink);
  const dimensions = dimensionText || (image ? `${image.width} × ${image.height}` : 'Not available');
  const fileLabel = filename ? String(filename).slice(0, 32) : 'Filename unavailable';
  doc.text(`Dimensions: ${dimensions}`, x + 4, y + height - 12);
  doc.text(fileLabel, x + 4, y + height - 6);
};

const makeSummary = ({ changed, unchanged, categories }) => {
  const lines = [];
  lines.push(changed === null
    ? 'The binary change result is not available in the current analysis data.'
    : `The existing binary change model marked ${changed.toFixed(1)}% of analyzed pixels as changed and ${unchanged.toFixed(1)}% as unchanged.`);

  if (categories.length) {
    const largest = [...categories].sort((a, b) => Math.abs((b.delta ?? (b.t2 - b.t1))) - Math.abs((a.delta ?? (a.t2 - a.t1))))[0];
    const delta = largest.delta ?? largest.t2 - largest.t1;
    lines.push(`The largest available approximate land-cover shift is ${largest.category}: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} percentage points from T1 to T2.`);
  } else {
    lines.push('Land-cover category values are unavailable, so category-level change is not summarized.');
  }

  return lines;
};

const addStatCard = (doc, x, y, width, label, value) => {
  doc.setFillColor(...COLORS.pale);
  doc.setDrawColor(204, 251, 241);
  doc.roundedRect(x, y, width, 25, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(label, x + 3, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.ink);
  doc.text(value, x + 3, y + 17);
};

const addTable = (doc, categories, y) => {
  const widths = [68, 36, 36, 42];
  const headers = ['Category', 'T1 (%)', 'T2 (%)', 'Difference (pp)'];
  const xPositions = [MARGIN, MARGIN + widths[0], MARGIN + widths[0] + widths[1], MARGIN + widths[0] + widths[1] + widths[2]];
  const rowHeight = 9;

  doc.setFillColor(...COLORS.accent);
  doc.rect(MARGIN, y - 6, CONTENT_WIDTH, rowHeight, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  headers.forEach((header, index) => doc.text(header, xPositions[index] + 2, y));

  let rowY = y + rowHeight;
  categories.forEach((item, index) => {
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, rowY - 6, CONTENT_WIDTH, rowHeight, 'F');
    }
    const delta = item.delta ?? item.t2 - item.t1;
    const values = [item.category, item.t1.toFixed(1), item.t2.toFixed(1), `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.ink);
    values.forEach((value, valueIndex) => doc.text(value, xPositions[valueIndex] + 2, rowY));
    rowY += rowHeight;
  });
  return rowY;
};

export const generateAnalysisReport = async ({ analysis, images }) => {
  if (!analysis || !images) throw new Error('A completed analysis and its source images are required to generate a report.');
  const raw = analysis.raw || analysis;
  const data = raw?.data || raw;
  const categories = normalizedCategories(analysis);
  const analysisQuality = firstValue(analysis.imageQuality, data.imageQuality, data.image_quality, {});
  const endpointQuality = analysis.qualityCheck?.imageQuality;
  const quality = endpointQuality
    ? {
        ...analysisQuality,
        ...endpointQuality,
        preprocessing: {
          ...analysisQuality?.preprocessing,
          ...endpointQuality.preprocessing,
          original_dimensions: endpointQuality.preprocessing?.original_dimensions
            || analysisQuality?.preprocessing?.original_dimensions
        }
      }
    : analysisQuality;
  const changeMask = data.changeMask || data.change_mask || {};
  const summary = data.summary || {};
  const changed = finiteNumber(firstValue(changeMask.changedPixelPercent, changeMask.changed_pixel_percent, data.binaryChange?.changePercent, data.binaryChange?.change_percent, summary.netClassShiftPercent, summary.net_class_shift_percent));
  const unchanged = changed === null ? null : 100 - changed;
  const beforeSrc = images.t1Image || (images.t1File ? URL.createObjectURL(images.t1File) : null);
  const afterSrc = images.t2Image || (images.t2File ? URL.createObjectURL(images.t2File) : null);
  let beforeImage = null;
  let afterImage = null;

  try {
    [beforeImage, afterImage] = await Promise.all([
      imageAsJpeg(beforeSrc).catch(() => null),
      imageAsJpeg(afterSrc).catch(() => null)
    ]);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const now = new Date();
    const reportId = `GZX-${now.toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replaceAll('T', '')}`;
    const originalDims = quality?.preprocessing?.original_dimensions;
    const t1Dimensions = originalDims?.t1?.width && originalDims?.t1?.height
      ? `${originalDims.t1.width} × ${originalDims.t1.height}`
      : beforeImage ? `${beforeImage.width} × ${beforeImage.height}` : 'Not available';
    const t2Dimensions = originalDims?.t2?.width && originalDims?.t2?.height
      ? `${originalDims.t2.width} × ${originalDims.t2.height}`
      : afterImage ? `${afterImage.width} × ${afterImage.height}` : 'Not available';

    doc.setFillColor(...COLORS.pale);
    doc.rect(0, 0, PAGE_WIDTH, 42, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.accent);
    doc.text('GeoZenX.ai', MARGIN, 15);
    doc.setFontSize(21);
    doc.setTextColor(...COLORS.ink);
    doc.text('Satellite Image Change', MARGIN, 26);
    doc.text('Detection Report', MARGIN, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text('Before and After Image Analysis', PAGE_WIDTH - MARGIN, 17, { align: 'right' });
    doc.text(`Report ID: ${reportId}`, PAGE_WIDTH - MARGIN, 24, { align: 'right' });
    doc.text(`Generated: ${now.toLocaleString()}`, PAGE_WIDTH - MARGIN, 31, { align: 'right' });

    const panelY = 50;
    const panelWidth = (CONTENT_WIDTH - 6) / 2;
    const panelHeight = 92;
    addImagePanel(doc, {
      x: MARGIN, y: panelY, width: panelWidth, height: panelHeight, title: 'BEFORE (T1)',
      image: beforeImage, fallback: 'The original BEFORE image could not be embedded.',
      filename: images.t1File?.name || images.t1FileName, dimensionText: t1Dimensions
    });
    addImagePanel(doc, {
      x: MARGIN + panelWidth + 6, y: panelY, width: panelWidth, height: panelHeight, title: 'AFTER (T2)',
      image: afterImage, fallback: 'The original AFTER image could not be embedded.',
      filename: images.t2File?.name || images.t2FileName, dimensionText: t2Dimensions
    });

    let y = addSectionTitle(doc, 'Key results', 145);
    const gap = 4;
    const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
    addStatCard(doc, MARGIN, y, cardWidth, 'Changed area', displayNumber(changed, 1, '%'));
    addStatCard(doc, MARGIN + cardWidth + gap, y, cardWidth, 'Unchanged area', displayNumber(unchanged, 1, '%'));
    addStatCard(doc, MARGIN + (cardWidth + gap) * 2, y, cardWidth, 'BEFORE dimensions', t1Dimensions);
    addStatCard(doc, MARGIN + (cardWidth + gap) * 3, y, cardWidth, 'AFTER dimensions', t2Dimensions);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Image dimensions shown where available.', MARGIN, y + 32);

    y = addSectionTitle(doc, 'Analysis summary', y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.ink);
    const automaticSummary = makeSummary({ changed, unchanged, categories });
    automaticSummary.forEach((sentence) => {
      y = addWrappedText(doc, sentence, MARGIN, y, CONTENT_WIDTH, 10, 5) + 1;
    });

    y = addSectionTitle(doc, 'Binary change detection', y + 2);
    y = addWrappedText(doc, 'Binary change detection — model-predicted changed/unchanged pixels.', MARGIN, y, CONTENT_WIDTH, 10, 5) + 5;
    const threshold = firstValue(changeMask.threshold, changeMask.decisionThreshold, changeMask.decision_threshold);
    const totalPixels = finiteNumber(firstValue(changeMask.width, changeMask.inputWidth)) !== null
      && finiteNumber(firstValue(changeMask.height, changeMask.inputHeight)) !== null
      ? finiteNumber(firstValue(changeMask.width, changeMask.inputWidth)) * finiteNumber(firstValue(changeMask.height, changeMask.inputHeight))
      : null;
    const binaryRows = [
      ['Changed area', displayNumber(changed, 2, '%')],
      ['Unchanged area', displayNumber(unchanged, 2, '%')],
      ['Changed pixel count', displayNumber(firstValue(changeMask.changedPixelCount, changeMask.changed_pixel_count), 0)],
      ['Unchanged pixel count', displayNumber(firstValue(changeMask.unchangedPixelCount, changeMask.unchanged_pixel_count), 0)],
      ['Total analyzed pixels', displayNumber(totalPixels, 0)],
      ['Decision threshold', displayNumber(threshold, 2)]
    ].filter(([, value]) => value !== 'Not available');
    binaryRows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.ink);
      doc.text(label, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, MARGIN + 62, y);
      y += 7;
    });
    doc.addPage();
    y = addSectionTitle(doc, 'Land-cover analytics', 22);
    const t1Chart = createPieChart(categories, 't1');
    const t2Chart = createPieChart(categories, 't2');
    const comparisonChart = createComparisonChart(categories);
    if (categories.length) {
      const chartWidth = 86;
      const chartHeight = Math.min(50, chartWidth * 0.56);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.ink);
      doc.text('T1 composition', MARGIN, y);
      doc.text('T2 composition', MARGIN + 96, y);
      y += 4;
      if (t1Chart) doc.addImage(t1Chart, 'PNG', MARGIN, y, chartWidth, chartHeight);
      else addWrappedText(doc, 'No positive T1 values available to chart.', MARGIN, y + 10, chartWidth, 8, 4);
      if (t2Chart) doc.addImage(t2Chart, 'PNG', MARGIN + 96, y, chartWidth, chartHeight);
      else addWrappedText(doc, 'No positive T2 values available to chart.', MARGIN + 96, y + 10, chartWidth, 8, 4);
      y += chartHeight + 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.ink);
      doc.text('T1 vs T2 comparison', MARGIN, y);
      y += 2;
      const comparisonWidth = 178;
      const comparisonHeight = Math.min(72, categories.length * 11 + 10);
      doc.addImage(comparisonChart, 'PNG', MARGIN, y, comparisonWidth, comparisonHeight);
      y += comparisonHeight + 10;

      y = addSectionTitle(doc, 'Land-cover transition table', y);
      y = addTable(doc, categories, y);
      const t1Total = categories.reduce((sum, item) => sum + Math.max(0, item.t1), 0);
      const t2Total = categories.reduce((sum, item) => sum + Math.max(0, item.t2), 0);
      if (Math.abs(t1Total - 100) > 1 || Math.abs(t2Total - 100) > 1) {
        y += 4;
        y = addWrappedText(doc, `Data-quality note: category totals are T1 ${t1Total.toFixed(1)}% and T2 ${t2Total.toFixed(1)}%. Pie charts normalize slices for display; legend and table values remain the backend values.`, MARGIN, y, CONTENT_WIDTH, 8, 4) + 2;
      }
    } else {
      y = addWrappedText(doc, 'No valid category data is available for composition charts or the transition table.', MARGIN, y, CONTENT_WIDTH, 10, 5) + 5;
    }
    y += 4;
    addWrappedText(doc, 'Land-cover percentages are approximate RGB-based visual estimates and are not independently verified multispectral classifications.', MARGIN, y, CONTENT_WIDTH, 8, 4);

    addFooter(doc);
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    const filename = `GeoZenX_Change_Detection_Report_${localDate}.pdf`;
    doc.save(filename);
    return { imageWarnings: Number(!beforeImage) + Number(!afterImage) };
  } finally {
    if (images.t1File && !images.t1Image && beforeSrc?.startsWith('blob:')) URL.revokeObjectURL(beforeSrc);
    if (images.t2File && !images.t2Image && afterSrc?.startsWith('blob:')) URL.revokeObjectURL(afterSrc);
  }
};
