import React, { useEffect, useState, useReducer, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Select, MenuItem,
  InputLabel, FormControl, IconButton, Divider, Tooltip, Stack,
  Snackbar, AppBar, Toolbar, Tabs, Tab, ToggleButtonGroup, ToggleButton,
  Switch, FormControlLabel, Alert, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Rnd } from 'react-rnd';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOMServer from 'react-dom/server';
import {
  Save as SaveIcon, Delete as DeleteIcon, Add as AddIcon, Print as PrintIcon,
  Undo as UndoIcon, Redo as RedoIcon, FormatBold, FormatItalic, FormatUnderlined, 
  FormatAlignLeft, FormatAlignCenter, FormatAlignRight, TextFields as TextFieldsIcon, 
  QrCode2 as QrCode2Icon, Today as TodayIcon, NavigateBefore, NavigateNext, 
  ZoomIn, ZoomOut, AddPhotoAlternate, Description, ColorLens as ColorLensIcon,
  ContactMail as ContactMailIcon, AlternateEmail as AlternateEmailIcon, Phone as PhoneIcon, Badge as BadgeIcon,
  SaveAs as SaveAsIcon
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { apiClient } from '../apiClient';
import { useLocation } from 'react-router-dom';

// ===== Constants =====
const FONT_FAMILIES = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Poppins', 'Nunito', 'Rubik', 'Inter', 'Ubuntu',
  'Merriweather', 'Noto Sans', 'Oswald', 'PT Sans', 'Raleway', 'Work Sans', 'Karla', 'Mulish', 'Quicksand', 'Barlow',
  'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana'
];
const PAGE_SIZES = {
  badge: { width_mm: 76, height_mm: 100 },
  a6:   { width_mm: 105, height_mm: 148 },
  a5:   { width_mm: 148, height_mm: 210 },
  a4:   { width_mm: 210, height_mm: 297 },
  letter: { width_mm: 215.9, height_mm: 279.4 },
};
const DPI = 96;
const mmToPx = mm => (mm / 25.4) * DPI;
const pxToMm = px => (px * 25.4) / DPI;
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// ===== Helper: vCard generator =====
const generateVCardString = (data) => (
  `BEGIN:VCARD
VERSION:3.0
FN:${data.name || ''}
ORG:${data.company || ''}
TITLE:${data.designation || ''}
TEL;TYPE=WORK,VOICE:${data.phone || ''}
EMAIL:${data.email || ''}
END:VCARD`
);

// ===== State Management & Defaults =====
const getDefaultPage = () => ({
  id: uuidv4(),
  backgroundImage: null,
  backgroundColor: '#FFFFFF',
  print_backgroundColor: true,
  print_backgroundImage: true,
  margin_top_mm: 5, margin_right_mm: 5, margin_bottom_mm: 5, margin_left_mm: 5,
  fields: [],
});

const DEFAULT_TEMPLATE = {
  template_name: 'New Unsaved Template',
  page_size: 'badge',
  width_mm: 76, height_mm: 100, orientation: 'portrait',
  pages: [getDefaultPage()],
};

// ===== Reducer =====
const reducer = (state, action) => {
  const { activePageIndex } = state.meta;
  switch (action.type) {
    case 'LOAD_TEMPLATE':
      return { ...action.payload };
    case 'SET_PROPERTY':
      return { ...state, template: { ...state.template, [action.payload.prop]: action.payload.value } };
    case 'SET_PAGE_PROPERTY': {
      const { pageIndex, prop, value } = action.payload;
      const newPages = state.template.pages.map((p, i) => i === pageIndex ? { ...p, [prop]: value } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case 'SET_FIELD_PROPERTY': {
      const { fieldId, prop, value } = action.payload;
      const newPages = state.template.pages.map((p, i) =>
        i === activePageIndex ? { ...p, fields: p.fields.map(f => f.id === fieldId ? { ...f, [prop]: value } : f) } : p
      );
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case 'ADD_FIELD': {
      const newPages = state.template.pages.map((p, i) =>
        i === activePageIndex ? { ...p, fields: [...p.fields, action.payload.field] } : p
      );
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, selectedFieldId: action.payload.field.id } };
    }
    case 'DELETE_FIELD': {
      const { fieldId } = action.payload;
      const newPages = state.template.pages.map((page, index) => {
        if (index !== activePageIndex) return page;
        return { ...page, fields: page.fields.filter(field => field.id !== fieldId) };
      });
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, selectedFieldId: null } };
    }
    case 'ADD_PAGE':
      return { ...state, template: { ...state.template, pages: [...state.template.pages, action.payload.page] } };
    case 'SET_META':
      return { ...state, meta: { ...state.meta, ...action.payload } };
    default:
      return state;
  }
};

// ===== Custom useHistoryReducer =====
const useHistoryReducer = (reducer, initialState) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const wrappedDispatch = (action) => {
    setHistory(h => ({ undo: [...h.undo, state], redo: [] }));
    dispatch(action);
  };
  const undo = () => {
    if (history.undo.length === 0) return;
    const previousState = history.undo[history.undo.length - 1];
    setHistory(h => ({ undo: h.undo.slice(0, h.undo.length - 1), redo: [...h.redo, state] }));
    dispatch({ type: 'LOAD_TEMPLATE', payload: previousState });
  };
  const redo = () => {
    if (history.redo.length === 0) return;
    const nextState = history.redo[history.redo.length - 1];
    setHistory(h => ({ undo: [...h.undo, state], redo: h.redo.slice(0, h.redo.length - 1) }));
    dispatch({ type: 'LOAD_TEMPLATE', payload: nextState });
  };
  const loadState = (newState) => {
    dispatch({ type: 'LOAD_TEMPLATE', payload: newState });
    setHistory({ undo: [], redo: [] });
  };
  return { state, dispatch: wrappedDispatch, loadState, undo, redo, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
};

// ===== Main Component =====
export default function PrintDesigner({ user }) {
  const location = useLocation();
  const designMode = !location.search.includes('participantIds') && user?.role === 'admin';

  const [mainTab, setMainTab] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [loading, setLoading] = useState(false);
  const [templatesList, setTemplatesList] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const initialState = {
    template: { ...DEFAULT_TEMPLATE },
    meta: { activePageIndex: 0, selectedFieldId: null, editingFieldId: null, zoom: 1, design_mode: designMode, currentTemplateId: 'new' }
  };

  const { state, dispatch, loadState, undo, redo, canUndo, canRedo } = useHistoryReducer(reducer, initialState);
  const { template, meta } = state;
  const { activePageIndex, selectedFieldId, editingFieldId, zoom, design_mode, currentTemplateId } = meta;

  const [previewData, setPreviewData] = useState({
    name: 'John Doe',
    regno: 'DEL-0001',
    role: 'Delegate',
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    company: 'ACME Inc.',
    designation: 'Chief Innovator',
    photo: 'https://placehold.co/300x300/EFEFEF/AAAAAA&text=Sample'
  });

  const activePage = template.pages[activePageIndex];
  const selectedField = activePage?.fields.find(f => f.id === selectedFieldId) || null;

  useEffect(() => {
    // Dynamic load fonts based on fields used
    const allFonts = new Set();
    template.pages.forEach(p => p.fields.forEach(f => {
      if (f.fontFamily) allFonts.add(f.fontFamily.replace(/ /g, '+'));
    }));
    if (allFonts.size === 0) return;
    const fontUrl = `https://fonts.googleapis.com/css2?family=${[...allFonts].join('&family=')}&display=swap`;
    let link = document.getElementById('dynamic-google-fonts');
    if (!link) {
      link = document.createElement('link');
      link.id = 'dynamic-google-fonts';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = fontUrl;
  }, [template]);

  // Fetch templates list safely
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.async_get('/print-templates');
      if (res.success) {
        setTemplatesList(res.templates || []);
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      showSnackbar(err.message || 'Failed to fetch templates', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Common state and property setters
  const setMeta = (payload) => dispatch({ type: 'SET_META', payload });
  const setTemplateProperty = (prop, value) => dispatch({ type: 'SET_PROPERTY', payload: { prop, value } });
  const setPageProperty = (prop, value, pageIdx = activePageIndex) => dispatch({ type: 'SET_PAGE_PROPERTY', payload: { pageIndex: pageIdx, prop, value } });
  const setFieldProperty = (fieldId, prop, value) => {
    const numeric = ['fontSize', 'x_mm', 'y_mm', 'width_mm', 'height_mm'];
    const finalValue = numeric.includes(prop) ? (parseFloat(value) || 0) : value;
    dispatch({ type: 'SET_FIELD_PROPERTY', payload: { fieldId, prop, value: finalValue } });
  };

  // Add field with new types
  const addField = (type) => {
    const common = { id: uuidv4(), enabled: true, x_mm: 10, y_mm: 10 };
    let field;
    switch (type) {
      case 'photo':
        field = { ...common, type: 'photo', placeholder: '{{photo}}', width_mm: 25, height_mm: 25, frame: 'square' }; break;
      case 'contact_qr':
        field = { ...common, type: 'contact_qr', placeholder: 'vCard', width_mm: 20, height_mm: 20, bgColor: '#FFFFFF' }; break;
      case 'qr':
        field = { ...common, type: 'qr', placeholder: '{{regno}}', width_mm: 18, height_mm: 18, color: '#000000', bgColor: '#FFFFFF' }; break;
      case 'name':
      case 'role':
      case 'regno':
      case 'email':
      case 'phone':
        field = { ...common, type: 'text', placeholder: `{{${type}}}`, width_mm: 50, height_mm: 10, fontFamily: 'Roboto', fontSize: 12, color: '#000000', bold: false, italic: false, underline: false, align: 'left' }; break;
      default:
        field = { ...common, type: 'text', placeholder: '{{date}}', width_mm: 40, height_mm: 10, fontFamily: 'Roboto', fontSize: 10, color: '#333333', bold: false, italic: false, underline: false, align: 'left' };
    }
    dispatch({ type: 'ADD_FIELD', payload: { field } });
    setMainTab(1);
  };

  // Delete a selected field
  const deleteField = () => { if (selectedFieldId) dispatch({ type: 'DELETE_FIELD', payload: { fieldId: selectedFieldId } }); };

  // Load template from server or new
  const loadTemplate = (tpl) => {
    const loaded = tpl.template_data || tpl.templateData || {};
    const patch = { ...DEFAULT_TEMPLATE, ...loaded, templateName: tpl.templateName || DEFAULT_TEMPLATE.templateName };
    patch.pages = (patch.pages?.length) ? patch.pages.map(p => ({ ...getDefaultPage(), ...p, fields: p.fields || [] })) : [getDefaultPage()];
    loadState({
      template: patch,
      meta: { ...initialState.meta, currentTemplateId: tpl.id }
    });
  };

  // Reset to new template
  const handleNewTemplate = () => {
    loadTemplate({
      id: 'new',
      template_name: 'New Unsaved Template',
      template_data: { ...DEFAULT_TEMPLATE }
    });
  };

  // Save template to backend
  const handleSaveTemplate = async () => {
    if (!template.template_name || template.template_name.trim() === '') {
      showSnackbar('Template Name is required.', 'error');
      return;
    }
    if (!template.pages[0] || template.pages[0].fields.length === 0) {
      showSnackbar('Template must have at least one field.', 'error');
      return;
    }

    setLoading(true);
    showSnackbar('Saving template...', 'info');

    try {
      const payload = {
        templateName: template.template_name,
        templateData: template,
      };

      const isNew = currentTemplateId === 'new';
      const res = isNew
        ? await apiClient.async_post('/print-templates', payload)
        : await apiClient.async_put(`/print-templates/${currentTemplateId}`, payload);

      if (res.success && (res.template || res.templates?.[0])) {
        showSnackbar('Template saved successfully!', 'success');
        await fetchTemplates();
        loadTemplate(res.template || res.templates[0]);
      } else {
        throw new Error(res.message || 'Failed to save template');
      }
    } catch (err) {
      showSnackbar(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsNew = async () => {
    const newName = `${template.template_name}`;
    if (!newName || newName.trim() === '') {
      showSnackbar('Template Name is required.', 'error');
      return;
    }
    if (!template.pages[0] || template.pages[0].fields.length === 0) {
      showSnackbar('Template must have at least one field.', 'error');
      return;
    }

    setLoading(true);
    showSnackbar('Saving as new template...', 'info');

    try {
      // Create a payload with the new name
      const payload = {
        templateName: newName,
        templateData: { ...template, template_name: newName },
      };
      
      // Always use the POST endpoint to create a new template
      const res = await apiClient.async_post('/print-templates', payload);

      if (res.success && res.template) {
        showSnackbar('Template saved successfully as a new entry!', 'success');
        await fetchTemplates(); // Refresh the template list
        loadTemplate(res.template); // Load the newly created template
      } else {
        throw new Error(res.message || 'Failed to save template');
      }
    } catch (err) {
      showSnackbar(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete template confirmation handler
  const handleDeleteTemplate = async () => {
    setConfirmDeleteOpen(false);
    if (currentTemplateId === 'new') return showSnackbar('Cannot delete an unsaved template.', 'warning');
    setLoading(true);
    try {
      const res = await apiClient.async_delete(`/print-templates/${currentTemplateId}`);
      if (res.success) {
        showSnackbar('Template deleted successfully!', 'success');
        await fetchTemplates();
        handleNewTemplate();
      } else { throw new Error(res.message); }
    } catch (err) { showSnackbar(err.message, 'error'); }
    finally { setLoading(false); }
  };

  // Dimension handling for custom page sizes
  const handleDimensionChange = (prop, value) => {
    setTemplateProperty(prop, value);
    setTemplateProperty('page_size', 'custom');
  };
  
  // Apply predefined page sizes (portrait or landscape)
  const applySizeFromKey = (sizeKey) => {
    const base = PAGE_SIZES[sizeKey];
    if (!base) return;
    const isLandscape = template.orientation === 'landscape';
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'width_mm', value: isLandscape ? base.height_mm : base.width_mm } });
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'height_mm', value: isLandscape ? base.width_mm : base.height_mm } });
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'page_size', value: sizeKey } });
  };
  
  // Swap width and height on orientation change
  const handleOrientationChange = (_, newOrientation) => {
    if (!newOrientation || newOrientation === template.orientation) return;
    const { width_mm, height_mm } = template;
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'width_mm', value: height_mm } });
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'height_mm', value: width_mm } });
    dispatch({ type: 'SET_PROPERTY', payload: { prop: 'orientation', value: newOrientation } });
  };

  // Background image upload handler
  const handleBackgroundUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPageProperty('backgroundImage', reader.result);
    reader.readAsDataURL(file);
  };

  // Show user feedback with snackbar
  const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

  // Preload fonts and images for print preview
  const preloadPageAssets = async (page) => {
    const promises = [];
    promises.push(document.fonts.ready);
    if (page.backgroundImage && page.print_backgroundImage) {
      const bgImagePromise = new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = resolve;
        img.onerror = reject;
        img.src = page.backgroundImage;
      });
      promises.push(bgImagePromise);
    }
    await Promise.all(promises);
  };

  // Print preview logic
  const handlePrint = async () => {
    setLoading(true);
    showSnackbar('Generating PDF preview...', 'info');
    try {
      const { width_mm, height_mm } = template;
      const pdf = new jsPDF({
        orientation: width_mm > height_mm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [width_mm, height_mm]
      });

      for (let i = 0; i < template.pages.length; i++) {
        const pageData = template.pages[i];
        if (i > 0) pdf.addPage([width_mm, height_mm], template.orientation);

        if (pageData.print_backgroundImage && pageData.backgroundImage) {
          const imageType = pageData.backgroundImage.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          pdf.addImage(pageData.backgroundImage, imageType, 0, 0, width_mm, height_mm);
        } else if (pageData.print_backgroundColor) {
          pdf.setFillColor(pageData.backgroundColor);
          pdf.rect(0, 0, width_mm, height_mm, 'F');
        }

        const printContainer = document.createElement('div');
        document.body.appendChild(printContainer);
        Object.assign(printContainer.style, {
          position: 'fixed', top: '0', left: '0', opacity: '0', zIndex: '-1', pointerEvents: 'none'
        });

        const pageElement = document.createElement('div');
        printContainer.innerHTML = '';
        printContainer.appendChild(pageElement);
        Object.assign(pageElement.style, {
          width: `${width_mm}mm`,
          height: `${height_mm}mm`,
          position: 'relative',
          backgroundColor: 'transparent',
        });

        const fieldsHtml = pageData.fields
          .filter(f => f.enabled !== false)
          .map(f => ReactDOMServer.renderToStaticMarkup(<PrintField field={f} data={previewData} />))
          .join('');

        pageElement.innerHTML = `<div style="position:absolute; top:${pageData.margin_top_mm}mm; left:${pageData.margin_left_mm}mm; right:${pageData.margin_right_mm}mm; bottom:${pageData.margin_bottom_mm}mm;">${fieldsHtml}</div>`;

        await new Promise(resolve => requestAnimationFrame(resolve));
        await preloadPageAssets(pageData);

        const canvas = await html2canvas(pageElement, {
          scale: 4,
          useCORS: true,
          backgroundColor: null
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, width_mm, height_mm);

        document.body.removeChild(printContainer);
      }

      const blob = pdf.output('blob');
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      showSnackbar('Failed to generate PDF.', 'error');
    } finally {
      setLoading(false);
      setSnackbar(s => ({ ...s, open: false }));
    }
  };

  // Component to render each field in print preview
  const PrintField = ({ field, data }) => {
    const tokenReplace = (text, data) => (text || '')
      .replaceAll('{{name}}', data.name || '')
      .replaceAll('{{role}}', data.role || '')
      .replaceAll('{{regno}}', data.regno || '')
      .replaceAll('{{email}}', data.email || '')
      .replaceAll('{{phone}}', data.phone || '')
      .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }));

    const commonStyle = {
      position: 'absolute',
      left: `${field.x_mm}mm`,
      top: `${field.y_mm}mm`,
      width: `${field.width_mm}mm`,
      height: `${field.height_mm}mm`,
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    };

    if (field.type === 'photo') {
      return (
        <div style={{ ...commonStyle }}>
          <img
            src={data.photo}
            alt="participant"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: field.frame === 'circle' ? '50%' : '0'
            }}
          />
        </div>
      );
    }

    if (field.type === 'contact_qr') {
      const qrSVGString = ReactDOMServer.renderToStaticMarkup(
        <QRCodeSVG value={generateVCardString(data)} fgColor="#000000" bgColor="#FFFFFF" level="M" includeMargin={false} width="100%" height="100%" />
      );
      return <div style={commonStyle} dangerouslySetInnerHTML={{ __html: qrSVGString }} />;
    }

    if (field.type === 'qr') {
      const qrSVGString = ReactDOMServer.renderToStaticMarkup(
        <QRCodeSVG value={tokenReplace(field.placeholder, data)} fgColor={field.color} bgColor={field.bgColor} level="M" includeMargin={false} width="100%" height="100%" />
      );
      return <div style={commonStyle} dangerouslySetInnerHTML={{ __html: qrSVGString }} />;
    }

    // Text field
    const textStyle = {
      ...commonStyle,
      justifyContent: field.align === 'center' ? 'center' : field.align === 'right' ? 'flex-end' : 'flex-start',
      fontFamily: `'${field.fontFamily}', sans-serif`,
      fontSize: `${field.fontSize}pt`,
      color: field.color,
      fontWeight: field.bold ? 700 : 400,
      fontStyle: field.italic ? 'italic' : 'normal',
      textDecoration: field.underline ? 'underline' : 'none',
      padding: '0 1mm',
    };

    return <div style={textStyle}>{tokenReplace(field.placeholder, data)}</div>;
  };

  // Render UI
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      bgcolor: 'grey.100',
      overflow: 'hidden' // Prevent scrolling on the main container
    }}>
      {/* MS Word-like Ribbon AppBar */}
      <Box sx={{ flexShrink: 0 }}>
        <AppBar position="static" color="default" elevation={2} sx={{ 
          background: "#E3EFFF", 
          minHeight: "64px"
        }}>
        <Toolbar variant="regular" sx={{ alignItems: 'flex-end', minHeight: 60, padding: 0, pl: 2, pr: 0 }}>
          <Tabs value={mainTab} onChange={(e, v) => setMainTab(v)} indicatorColor="primary" textColor="primary"
            sx={{ minHeight: 48, height: 48, '.MuiTab-root': { fontWeight: 700, paddingLeft: 3, paddingRight: 3, minHeight: 48 } }}>
            <Tab label="File" />
            <Tab label="Home" />
            <Tab label="Insert" />
            <Tab label="Layout" />
            <Tab label="View" />
          </Tabs>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center" pr={3}>
            <TextField size="small" label="Sample Name" value={previewData.name} onChange={e => setPreviewData(p => ({ ...p, name: e.target.value }))} variant="outlined" sx={{ bgcolor: 'white' }} />
            <TextField size="small" label="Sample Reg No" value={previewData.regno} onChange={e => setPreviewData(p => ({ ...p, regno: e.target.value }))} variant="outlined" sx={{ bgcolor: 'white' }} />
            <Button startIcon={<PrintIcon />} variant="contained" color="secondary" sx={{ fontWeight: 600, boxShadow: 1 }} onClick={handlePrint}>
              Print Preview
            </Button>
          </Stack>
        </Toolbar>
              </AppBar>
      </Box>

      {/* Ribbon Controls */}
      <Box sx={{
        height: '64px', 
        background: "#e3f1ff", 
        borderBottom: '2px solid #bdd1ea', 
        display: 'flex',
        alignItems: 'center', 
        pl: 3, 
        pr: 2, 
        boxSizing: "border-box", 
        flexShrink: 0
      }}>
        {/* File Tab */}
        {mainTab === 0 && (
          <Stack direction="row" spacing={2} alignItems="center" sx={{ width: "100%" }}>
            <Button startIcon={<Description />} onClick={handleNewTemplate}>New</Button>
            <Divider orientation="vertical" flexItem />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Load Saved Template</InputLabel>
              <Select value={currentTemplateId} label="Load Saved Template" onChange={e => {
                const selectedTemplate = templatesList.find(t => t.id === e.target.value);
                if (selectedTemplate) loadTemplate(selectedTemplate);
              }}>
                {templatesList.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName || `Template ID: ${t.id}`}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Template Name"
              value={template.template_name}
              onChange={e => setTemplateProperty('template_name', e.target.value)}
              sx={{ bgcolor: 'white', minWidth: 180 }}
            />
            <Button startIcon={<SaveIcon />} variant="contained" onClick={handleSaveTemplate} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
            <Button startIcon={<SaveAsIcon />} variant="outlined" onClick={handleSaveAsNew} disabled={loading || currentTemplateId === 'new'}> Save As New </Button>
            <Button startIcon={<DeleteIcon />} variant="outlined" color="error" onClick={() => setConfirmDeleteOpen(true)} disabled={currentTemplateId === 'new'}>Delete</Button>
          </Stack>
        )}
        {/* Home Tab */}
        {mainTab === 1 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
            <Tooltip title="Undo"><IconButton onClick={undo} disabled={!canUndo}><UndoIcon /></IconButton></Tooltip>
            <Tooltip title="Redo"><IconButton onClick={redo} disabled={!canRedo}><RedoIcon /></IconButton></Tooltip>
            <Tooltip title="Delete Selected Field"><IconButton onClick={deleteField} disabled={!selectedFieldId}><DeleteIcon /></IconButton></Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Button size="small" component="label" startIcon={<AddPhotoAlternate />}>
              Upload BG
              <input type="file" accept="image/*" hidden onChange={(e) => handleBackgroundUpload(e.target.files[0])} />
            </Button>
            <FormControlLabel sx={{ ml: 0 }} control={<Switch size="small" checked={activePage?.print_backgroundImage} onChange={e => setPageProperty('print_backgroundImage', e.target.checked)} />} labelPlacement="start" label={<Typography variant="caption">Print Image</Typography>} />
            <Tooltip title="Background Color">
              <IconButton component="label">
                <ColorLensIcon />
                <input type="color" value={activePage?.backgroundColor || '#FFFFFF'} onChange={e => setPageProperty('backgroundColor', e.target.value)} style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }} />
              </IconButton>
            </Tooltip>
            <FormControlLabel sx={{ ml: 0 }} control={<Switch size="small" checked={activePage?.print_backgroundColor} onChange={e => setPageProperty('print_backgroundColor', e.target.checked)} />} labelPlacement="start" label={<Typography variant="caption">Print Color</Typography>} />
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            {selectedField?.type === 'photo' && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Frame Style</InputLabel>
                <Select value={selectedField.frame} label="Frame Style" onChange={e => setFieldProperty(selectedFieldId, 'frame', e.target.value)}>
                  <MenuItem value="square">Square</MenuItem>
                  <MenuItem value="circle">Circle</MenuItem>
                </Select>
              </FormControl>
            )}
            {selectedField?.type === 'text' && (
              <>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Font</InputLabel>
                  <Select value={selectedField.fontFamily} label="Font" onChange={(e) => setFieldProperty(selectedFieldId, 'fontFamily', e.target.value)}>
                    {FONT_FAMILIES.map(f => <MenuItem key={f} value={f} sx={{ fontFamily: f }}>{f}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField size="small" type="number" label="Size" sx={{ width: 90 }} value={selectedField.fontSize} onChange={e => setFieldProperty(selectedFieldId, 'fontSize', e.target.value)} InputProps={{ inputProps: { min: 1 } }} />
                <input type="color" value={selectedField.color} onChange={(e) => setFieldProperty(selectedFieldId, 'color', e.target.value)} style={{ width: 38, height: 38, border: '1px solid #ccc', borderRadius: '4px', padding: '2px', background: 'transparent', cursor: 'pointer' }} />
                <ToggleButtonGroup size="small">
                  <ToggleButton value="bold" selected={selectedField.bold} onClick={() => setFieldProperty(selectedFieldId, 'bold', !selectedField.bold)}><FormatBold /></ToggleButton>
                  <ToggleButton value="italic" selected={selectedField.italic} onClick={() => setFieldProperty(selectedFieldId, 'italic', !selectedField.italic)}><FormatItalic /></ToggleButton>
                  <ToggleButton value="underline" selected={selectedField.underline} onClick={() => setFieldProperty(selectedFieldId, 'underline', !selectedField.underline)}><FormatUnderlined /></ToggleButton>
                </ToggleButtonGroup>
                <ToggleButtonGroup size="small" value={selectedField.align} exclusive onChange={(e, v) => v && setFieldProperty(selectedFieldId, 'align', v)}>
                  <ToggleButton value="left"><FormatAlignLeft /></ToggleButton>
                  <ToggleButton value="center"><FormatAlignCenter /></ToggleButton>
                  <ToggleButton value="right"><FormatAlignRight /></ToggleButton>
                </ToggleButtonGroup>
              </>
            )}
            {selectedField?.type === 'qr' && (
              <>
                <TextField size="small" label="QR Value" sx={{ minWidth: 200 }} value={selectedField.placeholder} onChange={e => setFieldProperty(selectedFieldId, 'placeholder', e.target.value)} />
                <Typography variant="caption" sx={{ ml: 1 }}>Color:</Typography>
                <input type="color" value={selectedField.color} onChange={(e) => setFieldProperty(selectedFieldId, 'color', e.target.value)} style={{ width: 38, height: 38, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <Typography variant="caption" sx={{ ml: 1 }}>BG:</Typography>
                <input type="color" value={selectedField.bgColor} onChange={(e) => setFieldProperty(selectedFieldId, 'bgColor', e.target.value)} style={{ width: 38, height: 38, border: 'none', background: 'transparent', cursor: 'pointer' }} />
              </>
            )}
          </Stack>
        )}
        {/* Insert Tab */}
        {mainTab === 2 && (
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ width: "100%" }}>
            <Button startIcon={<TextFieldsIcon />} onClick={() => addField('name')}>Name</Button>
            <Button startIcon={<BadgeIcon />} onClick={() => addField('role')}>Role</Button>
            <Button startIcon={<TextFieldsIcon />} onClick={() => addField('regno')}>Reg No</Button>
            <Button startIcon={<AlternateEmailIcon />} onClick={() => addField('email')}>Email</Button>
            <Button startIcon={<PhoneIcon />} onClick={() => addField('phone')}>Phone</Button>
            <Button startIcon={<AddPhotoAlternate />} onClick={() => addField('photo')}>Photo</Button>
            <Button startIcon={<QrCode2Icon />} onClick={() => addField('qr')}>ID QR</Button>
            <Button startIcon={<ContactMailIcon />} onClick={() => addField('contact_qr')}>Contact QR</Button>
            <Button startIcon={<TodayIcon />} onClick={() => addField('date')}>Date</Button>
            <Button startIcon={<AddIcon />} onClick={() => dispatch({ type: 'ADD_PAGE', payload: { page: getDefaultPage() } })}>New Page</Button>
          </Stack>
        )}
        {/* Layout Tab */}
        {mainTab === 3 && (
          <Stack direction="row" spacing={2} alignItems="center" sx={{ width: "100%" }}>
            <FormControl size="small" sx={{ minWidth: 120 }}><InputLabel>Page Size</InputLabel>
              <Select value={template.page_size} label="Page Size" onChange={e => applySizeFromKey(e.target.value)}>
                {Object.keys(PAGE_SIZES).map(k => <MenuItem key={k} value={k}>{k.toUpperCase()}</MenuItem>)}
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
            <ToggleButtonGroup size="small" value={template.orientation} exclusive onChange={handleOrientationChange}>
              <ToggleButton value="portrait">Portrait</ToggleButton>
              <ToggleButton value="landscape">Landscape</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" type="number" label="Width (mm)" sx={{width: 110}} value={template.width_mm} onChange={e => handleDimensionChange('width_mm', e.target.value)} />
            <TextField size="small" type="number" label="Height (mm)" sx={{width: 110}} value={template.height_mm} onChange={e => handleDimensionChange('height_mm', e.target.value)} />
            <Divider orientation="vertical" flexItem />
            <TextField size="small" type="number" label="Margin T (mm)" sx={{width: 120}} value={activePage?.margin_top_mm} onChange={e => setPageProperty('margin_top_mm', e.target.value)} />
            <TextField size="small" type="number" label="Margin B (mm)" sx={{width: 120}} value={activePage?.margin_bottom_mm} onChange={e => setPageProperty('margin_bottom_mm', e.target.value)} />
            <TextField size="small" type="number" label="Margin L (mm)" sx={{width: 120}} value={activePage?.margin_left_mm} onChange={e => setPageProperty('margin_left_mm', e.target.value)} />
            <TextField size="small" type="number" label="Margin R (mm)" sx={{width: 120}} value={activePage?.margin_right_mm} onChange={e => setPageProperty('margin_right_mm', e.target.value)} />
          </Stack>
        )}
        {/* View Tab */}
        {mainTab === 4 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
            <FormControlLabel control={<Switch checked={design_mode} onChange={(e) => setMeta({ design_mode: e.target.checked })}/>} label={design_mode ? 'Design Mode' : 'Preview Mode'} />
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title="Zoom Out"><IconButton onClick={() => setMeta({ zoom: clamp(zoom - 0.1, 0.2, 3) })}><ZoomOut /></IconButton></Tooltip>
            <Typography sx={{ width: 50, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
            <Tooltip title="Zoom In"><IconButton onClick={() => setMeta({ zoom: clamp(zoom + 0.1, 0.2, 3) })}><ZoomIn /></IconButton></Tooltip>
          </Stack>
        )}
      </Box>

      {/* Canvas & Main Content Area */}
      <Box sx={{ 
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // Critical for flex child to properly constrain height
        overflow: 'hidden' // Prevent overflow on container
      }}>
        {/* Canvas Container with Scroll */}
        <Box sx={{ 
          flexGrow: 1,
          overflow: 'auto', // Only this section scrolls
          p: 3, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'flex-start',
          background: 'linear-gradient(180deg,#f6f8fd 0,#e8eef7 100%)',
          minHeight: 0 // Critical for proper scrolling behavior
        }}>
          {activePage &&
            <Paper
              elevation={6}
              sx={{
                position: 'relative',
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease',
                width: mmToPx(template.width_mm),
                height: mmToPx(template.height_mm),
                flexShrink: 0,
                my: 2,
                backgroundColor: activePage.backgroundColor,
                backgroundImage: design_mode && activePage.backgroundImage ? `url(${activePage.backgroundImage})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                overflow: 'visible'
              }}
              onClick={() => setMeta({ selectedFieldId: null })}
            >
              <Box
                sx={{
                  position: 'absolute', pointerEvents: 'none',
                  top: mmToPx(activePage.margin_top_mm), left: mmToPx(activePage.margin_left_mm),
                  right: mmToPx(activePage.margin_right_mm), bottom: mmToPx(activePage.margin_bottom_mm),
                  zIndex: 0
                }}
              >
                {activePage.fields.map(field => (
                  <Rnd
                    key={field.id}
                    bounds="parent"
                    enableResizing={{ top:false, right:true, bottom:true, left:false, topRight:false, bottomRight:true, bottomLeft:false, topLeft:false }}
                    position={{ x: mmToPx(field.x_mm), y: mmToPx(field.y_mm) }}
                    size={{ width: mmToPx(field.width_mm), height: mmToPx(field.height_mm) }}
                    onDragStop={(e, d) => { setFieldProperty(field.id, 'x_mm', pxToMm(d.x)); setFieldProperty(field.id, 'y_mm', pxToMm(d.y)); }}
                    onResizeStop={(e, dir, ref, delta, pos) => {
                      setFieldProperty(field.id, 'width_mm', pxToMm(ref.offsetWidth));
                      setFieldProperty(field.id, 'height_mm', pxToMm(ref.offsetHeight));
                      setFieldProperty(field.id, 'x_mm', pxToMm(pos.x));
                      setFieldProperty(field.id, 'y_mm', pxToMm(pos.y));
                    }}
                    onClick={(e) => { e.stopPropagation(); setMeta({ selectedFieldId: field.id, editingFieldId: null }); setMainTab(1); }}
                    disableDragging={editingFieldId === field.id}
                    style={{
                      pointerEvents: 'all',
                      display: field.enabled === false ? 'none' : 'flex',
                      cursor: 'move',
                      border: `2px solid ${selectedFieldId === field.id ? '#1976d2' : 'transparent'}`,
                      boxSizing: 'border-box',
                      zIndex: 4
                    }}
                  >
                    {/* Field Rendering for All Types */}
                    {field.type === 'photo' && (
                      <img
                        src={previewData.photo}
                        alt="participant"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: field.frame === 'circle' ? '50%' : '0'
                        }}
                      />
                    )}
                    {field.type === 'contact_qr' && (
                      <QRCodeSVG value={generateVCardString(previewData)} style={{ width: '95%', height: '95%' }} />
                    )}
                    {field.type === 'qr' && (
                      <QRCodeSVG value={previewData.regno || ''} fgColor={field.color} bgColor={field.bgColor} style={{ width: '95%', height: '95%' }}/>
                    )}
                    {field.type === 'text' && (
                      <Box sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        alignItems: 'center',
                        padding: '0 4px',
                        justifyContent: field.align === 'center' ? 'center' : field.align === 'right' ? 'flex-end' : 'flex-start',
                        fontFamily: field.fontFamily,
                        fontSize: field.fontSize,
                        color: field.color,
                        fontWeight: field.bold ? '700' : '400',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        textDecoration: field.underline ? 'underline' : 'none',
                      }}>
                        {(field.placeholder || '').replaceAll('{{name}}', previewData.name || '')
                                                  .replaceAll('{{role}}', previewData.role || '')
                                                  .replaceAll('{{regno}}', previewData.regno || '')
                                                  .replaceAll('{{email}}', previewData.email || '')
                                                  .replaceAll('{{phone}}', previewData.phone || '')
                                                  .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN'))
                        }
                      </Box>
                    )}
                  </Rnd>
                ))}
              </Box>
            </Paper>
          }
        </Box>

        {/* Page navigation - Fixed at bottom */}
        <Box sx={{ flexShrink: 0 }}>
          <Paper square elevation={2} sx={{p:0.5, backgroundColor: '#f5f5f5' }}>
            <Stack direction="row" alignItems="center" spacing={1.5} justifyContent="flex-end" px={2}>
              <IconButton onClick={() => setMeta({ activePageIndex: Math.max(0, activePageIndex - 1)})} disabled={activePageIndex === 0} size="small"><NavigateBefore /></IconButton>
              <Typography variant="body2">Page {activePageIndex + 1} of {template.pages.length}</Typography>
              <IconButton onClick={() => setMeta({ activePageIndex: Math.min(template.pages.length - 1, activePageIndex + 1)})} disabled={activePageIndex >= template.pages.length - 1} size="small"><NavigateNext /></IconButton>
            </Stack>
          </Paper>
        </Box>
      </Box>

      {/* Template Delete Dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to permanently delete "{template.template_name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteTemplate} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}