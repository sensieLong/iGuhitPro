// app.js - iGuhit Vector Application Logic using Paper.js

// Self-contained Visual Error Catcher for easier debugging
window.addEventListener('error', function(e) {
    console.error("Uncaught error: ", e.error);
    const errDiv = document.getElementById('debug-error-banner');
    if (errDiv) errDiv.remove();
    
    const div = document.createElement('div');
    div.id = 'debug-error-banner';
    div.style.position = 'fixed';
    div.style.bottom = '30px';
    div.style.left = '10px';
    div.style.backgroundColor = '#d9534f';
    div.style.color = '#fff';
    div.style.padding = '8px 12px';
    div.style.zIndex = '99999';
    div.style.fontSize = '11px';
    div.style.fontFamily = 'monospace';
    div.style.borderRadius = '3px';
    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
    div.innerHTML = `<span style="font-weight:bold;">JS Error:</span> ${e.message} (${e.filename.split('/').pop()}:${e.lineno}) <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;margin-left:10px;cursor:pointer;font-weight:bold;">&times;</button>`;
    document.body.appendChild(div);
});

// Global Application State
const state = {
    activeToolName: 'select',
    fillColor: '#ffffff',
    fillColorNone: false,
    strokeColor: '#000000',
    strokeColorNone: false,
    strokeWidth: 2,
    opacity: 100, // percentage 0-100
    
    // Artboard dimensions — 8.5 × 11 inches at 300 ppi (US Letter, print quality)
    artboardWidth: 2550,   // 8.5 × 300
    artboardHeight: 3300,  // 11  × 300
    artboardUnit: 'in',
    artboardResolution: 300,
    
    // Zoom & Pan
    zoomLevel: 1,
    minZoom: 0.05,
    maxZoom: 32,
    
    // Color selector active target ('fill' or 'stroke')
    activeColorTarget: 'fill',
    
    // Undo / Redo History Stacks (contains JSON state strings)
    undoStack: [],
    redoStack: [],
    maxHistory: 30,
    
    // Previous tool state (for spacebar drag return)
    prevToolBeforeSpace: null,
    
    // Virtual modifier keys toggles
    virtualCtrl: false,
    virtualAlt: false,
    virtualShift: false,
    
    // Artboard styling
    artboardBgColor: '#ffffff'
};

// Paper.js objects references
let artboardLayer; // Background Layer (locked)
let drawLayer;     // Active Layer for user drawings
let artboardRect;  // White visual artboard
let artboardShadow;// Visual drop shadow
let gridGroup;     // Guidelines group

// Current active paper.js Tool
let currentPaperTool = null;
window.currentPaperTool = null; // exposed for feature packs

// References to drawing items
let activePath = null;       // Pen or Pencil active path
let dragTarget = null;       // Selection drag target
let dragTargetSegment = null;// Direct selection segment target
let dragTargetHandle = null; // Direct selection handle target
let marqueeStartPoint = null;
let altClones = [];
let altClonesCreated = false;
let isDraggingPenHandle = false;
let shapeClickOrigin = null;
let shapeClickType = 'rect';
let lastSelectedModalUnit = 'px';

// Predefined Swatches Palette
const SWATCHES = [
    { name: 'None', hex: null },
    { name: 'Black', hex: '#000000' },
    { name: 'Dark Gray 3', hex: '#1a1a1a' },
    { name: 'Dark Gray 2', hex: '#333333' },
    { name: 'Dark Gray 1', hex: '#4d4d4d' },
    { name: 'Medium Gray', hex: '#808080' },
    { name: 'Light Gray 1', hex: '#b3b3b3' },
    { name: 'Light Gray 2', hex: '#d9d9d9' },
    { name: 'White', hex: '#ffffff' },
    
    { name: 'Red', hex: '#e74c3c' },
    { name: 'Coral', hex: '#ff6f61' },
    { name: 'Orange', hex: '#e67e22' },
    { name: 'Yellow', hex: '#f1c40f' },
    { name: 'Green', hex: '#2ecc71' },
    { name: 'Mint', hex: '#1abc9c' },
    { name: 'Teal', hex: '#16a085' },
    { name: 'Sky Blue', hex: '#3498db' },
    { name: 'Navy Blue', hex: '#2980b9' },
    { name: 'Indigo', hex: '#3f51b5' },
    { name: 'Purple', hex: '#9b59b6' },
    { name: 'Lavender', hex: '#a593e0' },
    { name: 'Magenta', hex: '#9b59b6' },
    { name: 'Pink', hex: '#ff8b94' },
    { name: 'Salmon', hex: '#ffaaa5' }
];

window.addEventListener('load', () => {
    initApp();
});

// Initialize the entire application
function initApp() {
    setupPaperJS();
    setupSwatches();
    setupLayers();
    setupTools();
    setupUIEventListeners();
    setupKeyboardShortcuts();
    
    // Initial Undo State Save
    saveState();
    
    // Fit artboard on load
    setTimeout(fitArtboardToScreen, 100);
}

// -------------------------------------------------------------
// PAPER.JS SETUP
// -------------------------------------------------------------
function setupPaperJS() {
    const canvas = document.getElementById('paper-canvas');
    paper.setup(canvas);
    
    // Create custom layers
    artboardLayer = new paper.Layer();
    artboardLayer.name = 'System Artboard';
    artboardLayer.data = {
        artboardUnit: state.artboardUnit,
        artboardResolution: state.artboardResolution
    };
    
    drawLayer = new paper.Layer();
    drawLayer.name = 'Layer 1';
    drawLayer.activate();
    
    // Draw visual Artboard in the artboardLayer
    artboardLayer.activate();
    
    // Artboard Shadow (slightly offset dark rectangle)
    artboardShadow = new paper.Path.Rectangle({
        point: [204, 154],
        size: [state.artboardWidth, state.artboardHeight],
        fillColor: '#121212',
        opacity: 0.4
    });
    artboardShadow.name = 'artboardShadow';
    
    // White Artboard
    artboardRect = new paper.Path.Rectangle({
        point: [200, 150],
        size: [state.artboardWidth, state.artboardHeight],
        fillColor: '#ffffff',
        strokeColor: '#555555',
        strokeWidth: 1
    });
    artboardRect.name = 'artboardRect';
    
    // Draw Grid Lines on the Artboard (subtle gray lines)
    gridGroup = new paper.Group();
    gridGroup.name = 'gridGroup';
    
    const gridSpacing = 50;
    
    // Vertical gridlines
    for (let x = 200 + gridSpacing; x < 200 + state.artboardWidth; x += gridSpacing) {
        let line = new paper.Path.Line({
            from: [x, 150],
            to: [x, 150 + state.artboardHeight],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        });
        gridGroup.addChild(line);
    }
    // Horizontal gridlines
    for (let y = 150 + gridSpacing; y < 150 + state.artboardHeight; y += gridSpacing) {
        let line = new paper.Path.Line({
            from: [200, y],
            to: [200 + state.artboardWidth, y],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        });
        gridGroup.addChild(line);
    }
    
    artboardLayer.addChild(artboardShadow);
    artboardLayer.addChild(artboardRect);
    artboardLayer.addChild(gridGroup);
    
    // Prevent Selection/Interaction on the artboardLayer
    artboardLayer.locked = true;

    // Expose globals for enhancements.js
    window.artboardLayer  = artboardLayer;
    window.artboardRect   = artboardRect;
    window.artboardShadow = artboardShadow;
    window.gridGroup      = gridGroup;
    
    // Back to Drawing Layer
    drawLayer.activate();
    
    // Event listener for mouse coordinates in Status Bar
    paper.view.onMouseMove = (event) => {
        const artboardX = Math.round(event.point.x - 200);
        const artboardY = Math.round(event.point.y - 150);
        document.getElementById('mouse-coords').innerText = `X: ${artboardX} px, Y: ${artboardY} px`;
        
        // Handle cursor styles for Selection Tool resize handles
        if (state.activeToolName === 'select' && getSelectedDrawItems().length > 0) {
            const bounds = getSelectionBounds();
            const handles = getSelectionHandles(bounds);
            const tolerance = 8 / paper.view.zoom;
            let activeHandle = null;
            
            for (const [name, point] of Object.entries(handles)) {
                if (event.point.subtract(point).length < tolerance) {
                    activeHandle = name;
                    break;
                }
            }
            
            const canvas = document.getElementById('paper-canvas');
            if (activeHandle) {
                if (activeHandle === 'top-left' || activeHandle === 'bottom-right') {
                    canvas.style.cursor = 'nwse-resize';
                } else if (activeHandle === 'top-right' || activeHandle === 'bottom-left') {
                    canvas.style.cursor = 'nesw-resize';
                } else if (activeHandle === 'top-center' || activeHandle === 'bottom-center') {
                    canvas.style.cursor = 'ns-resize';
                } else if (activeHandle === 'left-center' || activeHandle === 'right-center') {
                    canvas.style.cursor = 'ew-resize';
                }
            } else {
                canvas.style.cursor = 'default';
            }
        } else {
            const canvas = document.getElementById('paper-canvas');
            if (canvas && canvas.style.cursor !== 'default' && canvas.style.cursor !== '') {
                canvas.style.cursor = 'default';
            }
        }
    };
}

// -------------------------------------------------------------
// SWATCHES GENERATOR
// -------------------------------------------------------------
function setupSwatches() {
    const grid = document.getElementById('swatches-grid');
    grid.innerHTML = '';
    
    SWATCHES.forEach(swatch => {
        const item = document.createElement('div');
        item.className = 'swatch-item';
        item.title = swatch.name;
        
        if (swatch.hex === null) {
            item.classList.add('swatch-none');
        } else {
            item.style.backgroundColor = swatch.hex;
        }
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.swatch-item').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            
            if (state.activeColorTarget === 'fill') {
                if (swatch.hex === null) {
                    state.fillColorNone = true;
                    document.getElementById('toolbar-fill-indicator').classList.add('none');
                    document.getElementById('btn-fill-none').classList.add('active');
                } else {
                    state.fillColorNone = false;
                    state.fillColor = swatch.hex;
                    document.getElementById('fill-color').value = swatch.hex;
                    document.getElementById('toolbar-fill-indicator').style.backgroundColor = swatch.hex;
                    document.getElementById('toolbar-fill-indicator').classList.remove('none');
                    document.getElementById('btn-fill-none').classList.remove('active');
                }
            } else {
                if (swatch.hex === null) {
                    state.strokeColorNone = true;
                    document.getElementById('toolbar-stroke-indicator').classList.add('none');
                    document.getElementById('btn-stroke-none').classList.add('active');
                } else {
                    state.strokeColorNone = false;
                    state.strokeColor = swatch.hex;
                    document.getElementById('stroke-color').value = swatch.hex;
                    document.getElementById('toolbar-stroke-indicator').style.borderColor = swatch.hex;
                    document.getElementById('toolbar-stroke-indicator').classList.remove('none');
                    document.getElementById('btn-stroke-none').classList.remove('active');
                }
            }
            applyStylesToSelection();
        });
        
        grid.appendChild(item);
    });
}

// -------------------------------------------------------------
// LAYERS MANAGER
// -------------------------------------------------------------
function setupLayers() {
    updateLayersUI();
}

function getItemNameAndIcon(item) {
    let name = item.name;
    let icon = '<i class="fa-solid fa-shapes"></i>';
    
    if (item instanceof paper.PointText) {
        icon = '<i class="fa-solid fa-font"></i>';
        if (!name) {
            name = item.content.length > 15 ? `Text: "${item.content.substring(0, 12)}..."` : `Text: "${item.content}"`;
        }
    } else if (item instanceof paper.Group) {
        icon = '<i class="fa-solid fa-object-group"></i>';
        if (!name) name = "Group";
    } else if (item instanceof paper.CompoundPath) {
        icon = '<i class="fa-solid fa-circle-nodes"></i>';
        if (!name) name = "Compound Path";
    } else if (item instanceof paper.Path) {
        if (item.className === 'Rectangle') {
            icon = '<i class="fa-regular fa-square"></i>';
            if (!name) name = "Rectangle";
        } else if (item.className === 'Ellipse') {
            icon = '<i class="fa-regular fa-circle"></i>';
            if (!name) name = "Ellipse";
        } else {
            icon = '<i class="fa-solid fa-pen-nib"></i>';
            if (!name) name = item.closed ? "Path" : "Line";
        }
    }
    
    if (!name) {
        name = "Item";
    }
    return { name, icon };
}

function updateLayersUI() {
    const list = document.getElementById('layers-list');
    list.innerHTML = '';
    
    // List all user drawing layers
    const drawingLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
    
    // Display in reverse order (top layer first in UI list)
    [...drawingLayers].reverse().forEach(layer => {
        const item = document.createElement('li');
        item.className = 'layer-item';
        if (layer === paper.project.activeLayer) {
            item.classList.add('active');
        }
        
        // Expand/Collapse Chevron Button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'layer-expand-btn';
        if (layer.data.expanded === undefined) {
            layer.data.expanded = true; // Default expanded
        }
        if (layer.data.expanded) {
            expandBtn.classList.add('expanded');
        }
        expandBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        
        // Hide chevron icon if layer has no children
        if (layer.children.length === 0) {
            expandBtn.style.visibility = 'hidden';
        }
        
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.data.expanded = !layer.data.expanded;
            updateLayersUI();
        });
        
        // Visibility Toggle Button (Eye)
        const visBtn = document.createElement('button');
        visBtn.className = 'layer-visibility';
        if (!layer.visible) visBtn.classList.add('hidden');
        visBtn.innerHTML = layer.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            visBtn.innerHTML = layer.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
            if (!layer.visible) visBtn.classList.add('hidden');
            else visBtn.classList.remove('hidden');
            paper.view.draw();
        });
        
        // Lock Toggle Button (Padlock)
        const lockBtn = document.createElement('button');
        lockBtn.className = 'layer-lock';
        if (layer.locked) lockBtn.classList.add('locked');
        lockBtn.innerHTML = layer.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.locked = !layer.locked;
            lockBtn.innerHTML = layer.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
            if (layer.locked) lockBtn.classList.add('locked');
            else lockBtn.classList.remove('locked');
        });
        
        // Layer Color Preview Indicator
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'layer-preview-color';
        if (!layer.data.color) {
            const colors = ['#4a90e2', '#e24a4a', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
            layer.data.color = colors[paper.project.layers.indexOf(layer) % colors.length];
        }
        colorIndicator.style.backgroundColor = layer.data.color;
        
        // Layer Name Input (Double click to rename)
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'layer-title-input';
        titleInput.value = layer.name || 'Unnamed Layer';
        titleInput.readOnly = true;
        titleInput.addEventListener('dblclick', () => {
            titleInput.readOnly = false;
            titleInput.select();
        });
        titleInput.addEventListener('blur', () => {
            titleInput.readOnly = true;
            layer.name = titleInput.value;
        });
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                titleInput.blur();
            }
        });
        
        // Target selection circle at right
        const targetBtn = document.createElement('div');
        targetBtn.className = 'layer-target';
        targetBtn.title = 'Select Layer Contents';
        
        const allSelected = layer.children.length > 0 && layer.children.every(child => child.selected);
        if (allSelected) {
            targetBtn.style.backgroundColor = layer.data.color;
            targetBtn.style.borderColor = layer.data.color;
        } else {
            targetBtn.style.backgroundColor = 'transparent';
            targetBtn.style.borderColor = '';
        }
        
        targetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deselectAll();
            layer.children.forEach(child => child.selected = true);
            layer.activate();
            onSelectionChanged();
            paper.view.draw();
        });
        
        item.appendChild(expandBtn);
        item.appendChild(visBtn);
        item.appendChild(lockBtn);
        item.appendChild(colorIndicator);
        item.appendChild(titleInput);
        item.appendChild(targetBtn);
        
        // Click to activate layer
        item.addEventListener('click', () => {
            deselectAll();
            layer.activate();
            onSelectionChanged();
            paper.view.draw();
        });
        
        list.appendChild(item);
        
        // Render sub-items (children of this layer) if expanded
        if (layer.data.expanded) {
            [...layer.children].reverse().forEach(child => {
                const childItem = document.createElement('li');
                childItem.className = 'layer-child-item';
                if (child.selected) {
                    childItem.classList.add('active');
                }
                
                // Visibility toggle for child item
                const childVisBtn = document.createElement('button');
                childVisBtn.className = 'layer-visibility';
                if (!child.visible) childVisBtn.classList.add('hidden');
                childVisBtn.innerHTML = child.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
                childVisBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    child.visible = !child.visible;
                    childVisBtn.innerHTML = child.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
                    if (!child.visible) childVisBtn.classList.add('hidden');
                    else childVisBtn.classList.remove('hidden');
                    paper.view.draw();
                });
                
                // Icon and Name
                const info = getItemNameAndIcon(child);
                const childIcon = document.createElement('span');
                childIcon.innerHTML = info.icon;
                childIcon.style.color = layer.data.color;
                
                const childTitle = document.createElement('span');
                childTitle.className = 'child-title';
                childTitle.innerText = info.name;
                
                // Target selection circle for child item
                const childTargetBtn = document.createElement('div');
                childTargetBtn.className = 'child-target';
                childTargetBtn.title = 'Select Item';
                if (child.selected) {
                    childTargetBtn.style.backgroundColor = layer.data.color;
                    childTargetBtn.style.borderColor = layer.data.color;
                }
                
                childTargetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deselectAll();
                    child.selected = true;
                    layer.activate();
                    onSelectionChanged();
                    paper.view.draw();
                });
                
                childItem.appendChild(childVisBtn);
                childItem.appendChild(childIcon);
                childItem.appendChild(childTitle);
                childItem.appendChild(childTargetBtn);
                
                // Click on child row to select
                childItem.addEventListener('click', () => {
                    deselectAll();
                    child.selected = true;
                    layer.activate();
                    onSelectionChanged();
                    paper.view.draw();
                });
                
                list.appendChild(childItem);
            });
        }
    });
}


function applyVirtualModifiers(event) {
    if (!event) return;
    
    // Save physical modifier states from the native browser event if available
    const native = event.event;
    const physicalAlt = native ? !!native.altKey : !!(event.modifiers && (event.modifiers.alt || event.modifiers.option));
    const physicalCtrl = native ? !!(native.ctrlKey || native.metaKey) : !!(event.modifiers && (event.modifiers.control || event.modifiers.command));
    const physicalShift = native ? !!native.shiftKey : !!(event.modifiers && event.modifiers.shift);
    
    // Combine physical keys with virtual buttons
    const finalAlt = physicalAlt || !!state.virtualAlt;
    const finalCtrl = physicalCtrl || !!state.virtualCtrl;
    const finalShift = physicalShift || !!state.virtualShift;
    
    if (event.modifiers) {
        // Alt / Option
        try {
            Object.defineProperty(event.modifiers, 'alt', { value: finalAlt, writable: true, configurable: true });
            Object.defineProperty(event.modifiers, 'option', { value: finalAlt, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.alt = finalAlt;
            event.modifiers.option = finalAlt;
        }
        
        // Control / Command
        try {
            Object.defineProperty(event.modifiers, 'control', { value: finalCtrl, writable: true, configurable: true });
            Object.defineProperty(event.modifiers, 'command', { value: finalCtrl, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.control = finalCtrl;
            event.modifiers.command = finalCtrl;
        }
        
        // Shift
        try {
            Object.defineProperty(event.modifiers, 'shift', { value: finalShift, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.shift = finalShift;
        }
    }
}

// -------------------------------------------------------------
// PAPER.JS INTERACTIVE TOOLS CREATION
// -------------------------------------------------------------
function setupTools() {
    currentPaperTool = new paper.Tool();
    window.currentPaperTool = currentPaperTool;
    
    // Core mouse events delegation
    currentPaperTool.onMouseDown = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        // Only block actual drawing tools when the active layer is locked.
        // Selection, direct-select, artboard, hand, zoom always work.
        const drawingTools = ['pen','pencil','rect','ellipse','line','type','eraser','rotate','shape-builder','blob-brush'];
        if (drawingTools.includes(tool)) {
            if (paper.project.activeLayer.locked) {
                // Try to auto-recover: activate the first unlocked draw layer
                const unlocked = paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
                if (unlocked) {
                    unlocked.activate();
                } else {
                    alert("The active layer is locked! Please unlock it or select another layer to draw.");
                    return;
                }
            }
        }
        
        if (tool === 'select') {
            handleSelectMouseDown(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDown(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseDown(event);
        } else if (tool === 'pen') {
            handlePenMouseDown(event);
        } else if (tool === 'type') {
            handleTypeMouseDown(event);
        } else if (tool === 'line') {
            handleLineMouseDown(event);
        } else if (tool === 'rect') {
            handleRectMouseDown(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseDown(event);
        } else if (tool === 'pencil') {
            handlePencilMouseDown(event);
        } else if (tool === 'eraser') {
            handleEraserMouseDown(event);
        } else if (tool === 'hand') {
            handleHandMouseDown(event);
        } else if (tool === 'zoom') {
            handleZoomMouseDown(event);
        } else if (tool === 'rotate') {
            handleRotateMouseDown(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseDown(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseDown(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseDown(event);
        }
    };
    
    currentPaperTool.onMouseDrag = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseDrag(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDrag(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseDrag(event);
        } else if (tool === 'pen') {
            handlePenMouseDrag(event);
        } else if (tool === 'line') {
            handleLineMouseDrag(event);
        } else if (tool === 'rect') {
            handleRectMouseDrag(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseDrag(event);
        } else if (tool === 'pencil') {
            handlePencilMouseDrag(event);
        } else if (tool === 'eraser') {
            handleEraserMouseDrag(event);
        } else if (tool === 'hand') {
            handleHandMouseDrag(event);
        } else if (tool === 'zoom') {
            handleZoomMouseDrag(event);
        } else if (tool === 'rotate') {
            handleRotateMouseDrag(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseDrag(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseDrag(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseDrag(event);
        }
    };
    
    currentPaperTool.onMouseUp = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseUp(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseUp(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseUp(event);
        } else if (tool === 'pen') {
            handlePenMouseUp(event);
        } else if (tool === 'line') {
            handleLineMouseUp(event);
        } else if (tool === 'rect') {
            handleRectMouseUp(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseUp(event);
        } else if (tool === 'pencil') {
            handlePencilMouseUp(event);
        } else if (tool === 'eraser') {
            handleEraserMouseUp(event);
        } else if (tool === 'hand') {
            handleHandMouseUp(event);
        } else if (tool === 'zoom') {
            handleZoomMouseUp(event);
        } else if (tool === 'rotate') {
            handleRotateMouseUp(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseUp(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseUp(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseUp(event);
        }
    };
}

// -------------------------------------------------------------
// TOOL HANDLERS IMPLEMENTATION
// -------------------------------------------------------------

// --- Selection Tool Scale/Resize helpers & variables ---
let isScaling = false;
let scaleHandle = null;
let scaleAnchor = null;
let scaleStartBounds = null;
let scaleOrigVector = null;

function getSelectionBounds() {
    const selection = getSelectedDrawItems();
    if (selection.length === 0) return null;
    let bounds = null;
    selection.forEach(item => {
        if (!bounds) {
            bounds = item.bounds.clone();
        } else {
            bounds = bounds.unite(item.bounds);
        }
    });
    return bounds;
}

function getSelectionHandles(bounds) {
    if (!bounds) return {};
    return {
        'top-left': bounds.topLeft,
        'top-center': bounds.topCenter,
        'top-right': bounds.topRight,
        'left-center': bounds.leftCenter,
        'right-center': bounds.rightCenter,
        'bottom-left': bounds.bottomLeft,
        'bottom-center': bounds.bottomCenter,
        'bottom-right': bounds.bottomRight
    };
}

function getOppositePoint(bounds, handleName) {
    switch (handleName) {
        case 'top-left': return bounds.bottomRight;
        case 'top-center': return bounds.bottomCenter;
        case 'top-right': return bounds.bottomLeft;
        case 'left-center': return bounds.rightCenter;
        case 'right-center': return bounds.leftCenter;
        case 'bottom-left': return bounds.topRight;
        case 'bottom-center': return bounds.topCenter;
        case 'bottom-right': return bounds.topLeft;
        default: return null;
    }
}

function resetVirtualAlt() {
    state.virtualAlt = false;
    const altBtn = document.getElementById('btn-virtual-alt');
    if (altBtn) {
        altBtn.classList.remove('active');
    }
}

function handleSelectMouseDown(event) {
    dragTarget = null;
    marqueeStartPoint = null;
    altClonesCreated = false;
    altClones = [];
    isScaling = false;
    
    // Check if clicked on a resize handle first
    if (getSelectedDrawItems().length > 0) {
        const bounds = getSelectionBounds();
        const handles = getSelectionHandles(bounds);
        const tolerance = 8 / paper.view.zoom;
        let clickedHandle = null;
        for (const [name, point] of Object.entries(handles)) {
            if (event.point.subtract(point).length < tolerance) {
                clickedHandle = name;
                break;
            }
        }
        
        if (clickedHandle) {
            isScaling = true;
            scaleHandle = clickedHandle;
            scaleAnchor = getOppositePoint(bounds, clickedHandle);
            scaleStartBounds = bounds.clone();
            scaleOrigVector = event.point.subtract(scaleAnchor);
            
            // Backup selected items for scaling
            const selection = getTopLevelSelectedDrawItems();
            selection.forEach(item => {
                item.data.originalClone = item.clone({ insert: false });
                item.data.dragIndex = item.parent.children.indexOf(item);
            });
            
            return; // Bypass normal selection hit-test/marquee
        }
    }
    
    // Hit test with tolerance of 6 pixels to find selected shape
    const hitResult = paper.project.hitTest(event.point, {
        fill: true,
        stroke: true,
        segments: true,
        tolerance: 6,
        match: (hit) => hit.item.layer.name !== 'System Artboard' && !hit.item.layer.locked
    });
    
    if (hitResult) {
        const item = hitResult.item;
        
        // Find topmost group/compound path if grouped
        let parentItem = item;
        while (parentItem.parent && 
               parentItem.parent instanceof paper.Group && 
               parentItem.parent.className !== 'Layer' && 
               parentItem.parent.layer.name !== 'System Artboard') {
            parentItem = parentItem.parent;
        }
        
        if (event.modifiers.shift) {
            // Toggle selection
            parentItem.selected = !parentItem.selected;
        } else {
            // If not selected, select it and deselect others
            if (!parentItem.selected) {
                deselectAll();
                parentItem.selected = true;
            }
        }
        
        if (parentItem.selected) {
            dragTarget = parentItem;
            parentItem.layer.activate();
            
            // Save starting positions of all selected items for Alt duplication
            const selectedItems = getSelectedDrawItems();
            selectedItems.forEach(item => {
                item.data.dragStartPos = item.position.clone();
            });
        }
        
        onSelectionChanged();
    } else {
        // Clicked in empty space -> Start Selection Marquee
        resetVirtualAlt();
        if (!event.modifiers.shift) {
            deselectAll();
        }
        marqueeStartPoint = event.point;
        selectionMarquee = new paper.Path.Rectangle({
            point: event.point,
            size: [0, 0],
            strokeColor: '#eb701b',
            strokeWidth: 1,
            dashArray: [4, 4]
        });
        onSelectionChanged();
    }
}

function handleSelectMouseDrag(event) {
    if (isScaling) {
        const isShift = event.modifiers.shift || state.virtualShift;
        const currVector = event.point.subtract(scaleAnchor);
        const origVector = scaleOrigVector;

        let scaleX = 1;
        let scaleY = 1;

        if (scaleHandle === 'left-center' || scaleHandle === 'right-center') {
            scaleX = origVector.x !== 0 ? currVector.x / origVector.x : 1;
        } else if (scaleHandle === 'top-center' || scaleHandle === 'bottom-center') {
            scaleY = origVector.y !== 0 ? currVector.y / origVector.y : 1;
        } else {
            // Corner handles
            scaleX = origVector.x !== 0 ? currVector.x / origVector.x : 1;
            scaleY = origVector.y !== 0 ? currVector.y / origVector.y : 1;
            
            if (isShift) {
                const absScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
                scaleX = absScale * Math.sign(scaleX || 1);
                scaleY = absScale * Math.sign(scaleY || 1);
            }
        }

        // Safe clamp to prevent collapse to zero/errors
        if (Math.abs(scaleX) < 0.001) scaleX = 0.001 * Math.sign(scaleX || 1);
        if (Math.abs(scaleY) < 0.001) scaleY = 0.001 * Math.sign(scaleY || 1);

        const selection = getTopLevelSelectedDrawItems();
        selection.forEach((item, i) => {
            if (!item.data.originalClone) return;
            const parent = item.parent;
            const originalClone = item.data.originalClone;
            const dragIndex = item.data.dragIndex;
            
            item.remove();
            
            const newScaledItem = originalClone.clone();
            newScaledItem.scale(scaleX, scaleY, scaleAnchor);
            
            parent.insertChild(dragIndex, newScaledItem);
            newScaledItem.data.originalClone = originalClone;
            newScaledItem.data.dragIndex = dragIndex;
            newScaledItem.selected = true;
            
            selection[i] = newScaledItem;
            if (dragTarget === item) {
                dragTarget = newScaledItem;
            }
        });
        
        updateSelectionVisualState();
        paper.view.draw();
        
    } else if (dragTarget) {
        // Check for Alt/Option key to duplicate items
        if (event.modifiers.option) {
            document.getElementById('paper-canvas').style.cursor = 'copy';
            if (!altClonesCreated) {
                const selectedItems = getTopLevelSelectedDrawItems();
                altClones = selectedItems.map(item => {
                    const clone = item.clone();
                    clone.selected = false;
                    if (item.data.dragStartPos) {
                        clone.position = item.data.dragStartPos.clone();
                    }
                    clone.insertBelow(item);
                    return clone;
                });
                altClonesCreated = true;
                updateLayersUI();
            }
        } else {
            document.getElementById('paper-canvas').style.cursor = 'default';
            if (altClonesCreated) {
                // If Alt key was released, remove the clones
                altClones.forEach(clone => clone.remove());
                altClones = [];
                altClonesCreated = false;
                updateLayersUI();
            }
        }
        
        const selectedItems = getTopLevelSelectedDrawItems();
        selectedItems.forEach(item => {
            item.position = item.position.add(event.delta);
        });
        updateSelectionVisualState();
    } else if (selectionMarquee) {
        selectionMarquee.remove();
        const rect = new paper.Rectangle(marqueeStartPoint, event.point);
        selectionMarquee = new paper.Path.Rectangle({
            rectangle: rect,
            strokeColor: '#eb701b',
            strokeWidth: 1,
            dashArray: [4, 4]
        });
    }
}

function handleSelectMouseUp(event) {
    if (isScaling) {
        isScaling = false;
        scaleHandle = null;
        scaleAnchor = null;
        scaleStartBounds = null;
        scaleOrigVector = null;
        
        // Clear original clones references to free memory
        const selection = getSelectedDrawItems();
        selection.forEach(item => {
            if (item.data) {
                delete item.data.originalClone;
                delete item.data.dragIndex;
            }
        });
        
        saveState();
        onSelectionChanged();
        paper.view.draw();
    } else if (dragTarget) {
        document.getElementById('paper-canvas').style.cursor = 'default';
        
        if (!event.modifiers.option && altClonesCreated) {
            altClones.forEach(clone => clone.remove());
            altClones = [];
            altClonesCreated = false;
        }
        
        saveState();
        onSelectionChanged();
        dragTarget = null;
        altClonesCreated = false;
        altClones = [];
    } else if (selectionMarquee) {
        const bounds = selectionMarquee.bounds;
        
        if (bounds.width > 2 || bounds.height > 2) {
            const drawItems = paper.project.activeLayer.children;
            drawItems.forEach(item => {
                if (bounds.intersects(item.bounds) || bounds.contains(item.bounds)) {
                    item.selected = true;
                }
            });
        }
        
        selectionMarquee.remove();
        selectionMarquee = null;
        marqueeStartPoint = null;
        onSelectionChanged();
    }
}

// --- DIRECT SELECTION TOOL (A) ---
function handleDirectSelectMouseDown(event) {
    dragTargetSegment = null;
    dragTargetHandle = null;
    dragTarget = null;
    
    const hitResult = paper.project.hitTest(event.point, {
        segments: true,
        handles: true,
        stroke: true,
        fill: true,
        tolerance: 6,
        match: (hit) => hit.item.layer.name !== 'System Artboard' && !hit.item.layer.locked
    });
    
    if (hitResult) {
        const item = hitResult.item;
        item.selected = true;
        item.layer.activate();
        
        if (hitResult.type === 'segment') {
            dragTargetSegment = hitResult.segment;
        } else if (hitResult.type === 'handle-in') {
            dragTargetHandle = hitResult.segment.handleIn;
        } else if (hitResult.type === 'handle-out') {
            dragTargetHandle = hitResult.segment.handleOut;
        } else {
            dragTarget = item;
        }
        
        onSelectionChanged();
    } else {
        if (!event.modifiers.shift) {
            deselectAll();
        } else {
            onSelectionChanged();
        }
    }
}

function handleDirectSelectMouseDrag(event) {
    if (dragTargetSegment) {
        dragTargetSegment.point = dragTargetSegment.point.add(event.delta);
    } else if (dragTargetHandle) {
        dragTargetHandle.x += event.delta.x;
        dragTargetHandle.y += event.delta.y;
    } else if (dragTarget) {
        dragTarget.position = dragTarget.position.add(event.delta);
    }
}

function handleDirectSelectMouseUp(event) {
    if (dragTargetSegment || dragTargetHandle || dragTarget) {
        saveState();
        dragTargetSegment = null;
        dragTargetHandle = null;
        dragTarget = null;
    }
}

// --- ARTBOARD TOOL (Shift+A) ---
let _artboardToolSelectedAb = null;
let _artboardDragStart      = null; // paper point where drag began
let _artboardDragOrigin     = null; // original TL of artboard being dragged

function handleArtboardToolMouseDown(event) {
    window._selectedArtboard = null;
    _artboardToolSelectedAb  = null;
    _artboardDragStart       = event.point;

    // Check secondary artboards first (non-isMain entries)
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        for (const ab of window.multiArtboards) {
            if (ab.isMain) continue;
            const rect = ab.rect;
            if (rect && rect.isInserted() && rect.bounds.contains(event.point)) {
                window._selectedArtboard = ab;
                _artboardToolSelectedAb  = ab;
                _artboardDragOrigin      = rect.bounds.topLeft.clone();
                // Highlight selected
                artboardLayer.locked = false;
                ab.rect.strokeColor = '#f17c22';
                ab.rect.strokeWidth = 2;
                artboardLayer.locked = true;
                break;
            }
        }
        // Unhighlight others
        artboardLayer.locked = false;
        window.multiArtboards.forEach(ab => {
            if (ab !== window._selectedArtboard && !ab.isMain && ab.rect && ab.rect.isInserted()) {
                ab.rect.strokeColor = '#555555';
                ab.rect.strokeWidth = 1;
            }
        });
        artboardLayer.locked = true;
    }

    // Check main artboard (always selectable)
    if (!window._selectedArtboard && window.artboardRect) {
        // Use the bounds directly — don't hit-test through the locked layer
        const abBounds = window.artboardRect.bounds;
        if (abBounds.contains(event.point)) {
            window._selectedArtboard = 'main';
            _artboardToolSelectedAb  = 'main';
            _artboardDragOrigin      = abBounds.topLeft.clone();
        }
    }

    // Update label
    const lbl = document.getElementById('artboard-sel-name');
    if (lbl) {
        if (window._selectedArtboard === 'main') lbl.textContent = 'Main Artboard';
        else if (window._selectedArtboard) {
            const secondaries = window.multiArtboards ? window.multiArtboards.filter(a => !a.isMain) : [];
            const idx = secondaries.indexOf(window._selectedArtboard);
            lbl.textContent = 'Artboard ' + (idx + 2);
        } else { lbl.textContent = 'None'; }
    }

    _syncArtboardInputsToSelected();

    // Collect all draw-layer items currently inside the selected artboard
    // so they can be moved together when dragging
    window._artboardDragItems = [];
    const sel = window._selectedArtboard;
    const selBounds = sel === 'main'
        ? (window.artboardRect ? window.artboardRect.bounds : null)
        : (window._selectedArtboard && window._selectedArtboard.rect ? window._selectedArtboard.rect.bounds : null);
    if (selBounds) {
        paper.project.layers.forEach(layer => {
            if (layer === artboardLayer) return;
            if (layer.name === 'System Artboard') return;
            layer.children.forEach(child => {
                try {
                    if (child.isInserted() && child.visible && child.bounds &&
                        selBounds.contains(child.bounds)) {
                        window._artboardDragItems.push(child);
                    }
                } catch(_) {}
            });
        });
    }

    paper.view.draw();
}

function handleArtboardToolMouseDrag(event) {
    const sel = window._selectedArtboard;
    if (!sel || !_artboardDragStart || !_artboardDragOrigin) return;

    const delta = event.point.subtract(_artboardDragStart);
    const newX  = _artboardDragOrigin.x + delta.x;
    const newY  = _artboardDragOrigin.y + delta.y;

    artboardLayer.locked = false;
    artboardLayer.activate();

    let dx = 0, dy = 0;

    if (sel === 'main') {
        const oldTL = window.artboardRect.bounds.topLeft;
        dx = newX - oldTL.x;
        dy = newY - oldTL.y;
        if (window.artboardShadow) window.artboardShadow.translate(dx, dy);
        if (window.artboardRect)   window.artboardRect.translate(dx, dy);
        if (window.gridGroup)      window.gridGroup.translate(dx, dy);
    } else if (sel.rect && sel.rect.isInserted()) {
        const oldTL = sel.rect.bounds.topLeft;
        dx = newX - oldTL.x;
        dy = newY - oldTL.y;
        if (sel.shadow && sel.shadow.isInserted()) sel.shadow.translate(dx, dy);
        sel.rect.translate(dx, dy);
        if (sel.grid && sel.grid.isInserted()) sel.grid.translate(dx, dy);
        sel.bounds = sel.rect.bounds;
    }

    artboardLayer.locked = true;

    // Move all draw-layer items that were inside this artboard at drag start
    if ((dx !== 0 || dy !== 0) && window._artboardDragItems) {
        window._artboardDragItems.forEach(item => {
            try {
                if (item.isInserted()) item.translate(dx, dy);
            } catch(_) {}
        });
    }

    const dl = window.drawLayer ||
        paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
    if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }

    paper.view.draw();
}

function handleArtboardToolMouseUp(event) {
    if (window._selectedArtboard && _artboardDragStart) {
        _syncArtboardInputsToSelected();
        if (window.saveState) saveState();
    }
    _artboardDragStart  = null;
    _artboardDragOrigin = null;
}

// Sync W/H control-bar inputs to whichever artboard is currently selected
function _syncArtboardInputsToSelected() {
    const sel = window._selectedArtboard;
    if (!sel) return;

    let w, h;
    if (sel === 'main') {
        w = state.artboardWidth;
        h = state.artboardHeight;
    } else if (sel.rect && sel.rect.isInserted()) {
        w = sel.rect.bounds.width;
        h = sel.rect.bounds.height;
    } else { return; }

    const unit = state.artboardUnit || 'px';
    const ppi  = state.artboardResolution || 96;
    function toDisplay(px) {
        switch (unit) {
            case 'in': return +(px / ppi).toFixed(3);
            case 'cm': return +(px / (ppi / 2.54)).toFixed(2);
            case 'mm': return +(px / (ppi / 25.4)).toFixed(1);
            default:   return Math.round(px);
        }
    }
    const wIn = document.getElementById('artboard-w-input');
    const hIn = document.getElementById('artboard-h-input');
    if (wIn) wIn.value = toDisplay(w);
    if (hIn) hIn.value = toDisplay(h);
}

// --- PEN TOOL (P) ---
function handlePenMouseDown(event) {
    if (!activePath) {
        deselectAll();
        activePath = new paper.Path();
        setupShapeStyles(activePath);
        activePath.fullySelected = true;
        
        activePath.add(new paper.Segment(event.point));
        isDraggingPenHandle = true;
    } else {
        // Hit test to close path
        const hitResult = paper.project.hitTest(event.point, {
            segments: true,
            tolerance: 8
        });
        
        if (hitResult && hitResult.item === activePath && hitResult.segment === activePath.segments[0]) {
            activePath.closed = true;
            activePath.fullySelected = false;
            activePath.selected = true;
            finishActivePath();
        } else {
            activePath.add(new paper.Segment(event.point));
            activePath.fullySelected = true;
            isDraggingPenHandle = true;
        }
    }
}

function handlePenMouseDrag(event) {
    if (activePath && isDraggingPenHandle) {
        const lastSegment = activePath.lastSegment;
        const delta = event.point.subtract(lastSegment.point);
        lastSegment.handleOut = delta;
        lastSegment.handleIn = delta.multiply(-1);
    }
}

function handlePenMouseUp(event) {
    isDraggingPenHandle = false;
}

function finishActivePath() {
    if (activePath) {
        activePath.fullySelected = false;
        activePath.selected = true;
        saveState();
        activePath = null;
    }
}

// --- TYPE TOOL (T) ---
function handleTypeMouseDown(event) {
    deselectAll();
    
    // Get font settings from control bar (injected by enhancement pack)
    const fontFamilyEl = document.getElementById('ctrl-font-family');
    const fontSizeEl = document.getElementById('ctrl-font-size');
    const fontWeightEl = document.getElementById('ctrl-font-weight');
    const fontStyleEl = document.getElementById('ctrl-font-style');
    
    const fontFamily = fontFamilyEl ? fontFamilyEl.value : 'Inter, sans-serif';
    const fontSize = fontSizeEl ? (parseFloat(fontSizeEl.value) || 24) : 24;
    const fontWeight = fontWeightEl ? fontWeightEl.value : '600';
    const fontStyleVal = fontStyleEl ? fontStyleEl.value : 'normal';
    
    // Show a styled prompt dialog
    const textVal = prompt("Enter text:", "iGuhit Vector");
    if (textVal) {
        const textItem = new paper.PointText({
            point: event.point,
            content: textVal,
            fontSize: fontSize,
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontStyle: fontStyleVal
        });
        setupShapeStyles(textItem);
        textItem.selected = true;
        
        // Store font data for re-sync
        if (fontFamilyEl) textItem.fontFamily = fontFamily;
        
        saveState();
        onSelectionChanged();
        
        // Sync font controls with new item
        if (window.__syncTypeFontControls) window.__syncTypeFontControls(textItem);
    }
}

// --- LINE TOOL (\) ---
function handleLineMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Line({
        from: event.point,
        to: event.point
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleLineMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        activePath = new paper.Path.Line({
            from: event.downPoint,
            to: event.point
        });
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleLineMouseUp(event) {
    if (activePath) {
        finishActivePath();
    }
}

function openShapeOptionsModal(type, point) {
    shapeClickType = type;
    shapeClickOrigin = point;
    lastSelectedModalUnit = state.artboardUnit;
    
    // Set Title
    document.getElementById('shape-modal-title').innerText = type === 'rect' ? 'Rectangle Options' : 'Ellipse Options';
    
    // Set Unit Dropdown
    const unitSelect = document.getElementById('shape-unit-select');
    unitSelect.value = state.artboardUnit;
    
    // Set default dimensions based on unit
    let defaultW = 100;
    let defaultH = 100;
    if (state.artboardUnit === 'in') {
        defaultW = 1.5;
        defaultH = 1.5;
    } else if (state.artboardUnit === 'cm') {
        defaultW = 4;
        defaultH = 4;
    } else if (state.artboardUnit === 'mm') {
        defaultW = 40;
        defaultH = 40;
    }
    
    const wInput = document.getElementById('shape-width-input');
    const hInput = document.getElementById('shape-height-input');
    wInput.value = defaultW;
    hInput.value = defaultH;
    
    // Set unit labels
    document.querySelectorAll('.shape-unit-label').forEach(el => el.innerText = state.artboardUnit);
    
    // Show Modal
    document.getElementById('shape-options-modal').classList.add('active');
    
    // Focus & select width input
    setTimeout(() => {
        wInput.focus();
        wInput.select();
    }, 50);
}

// --- RECTANGLE TOOL (M) ---
function handleRectMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Rectangle({
        point: event.point,
        size: [0, 0]
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleRectMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        let rectWidth = event.point.x - event.downPoint.x;
        let rectHeight = event.point.y - event.downPoint.y;
        
        if (event.modifiers.shift) {
            const size = Math.max(Math.abs(rectWidth), Math.abs(rectHeight));
            rectWidth = rectWidth < 0 ? -size : size;
            rectHeight = rectHeight < 0 ? -size : size;
        }
        
        activePath = new paper.Path.Rectangle({
            point: event.downPoint,
            size: [rectWidth, rectHeight]
        });
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleRectMouseUp(event) {
    if (activePath) {
        const dragDist = event.point.subtract(event.downPoint).length;
        if (dragDist < 3) {
            activePath.remove();
            activePath = null;
            openShapeOptionsModal('rect', event.downPoint);
        } else {
            finishActivePath();
        }
    }
}

// --- ELLIPSE TOOL (L) ---
function handleEllipseMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Ellipse({
        point: event.point,
        size: [0, 0]
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleEllipseMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        let rectWidth = event.point.x - event.downPoint.x;
        let rectHeight = event.point.y - event.downPoint.y;
        
        if (event.modifiers.shift) {
            const size = Math.max(Math.abs(rectWidth), Math.abs(rectHeight));
            rectWidth = rectWidth < 0 ? -size : size;
            rectHeight = rectHeight < 0 ? -size : size;
        }
        
        const rect = new paper.Rectangle(event.downPoint, new paper.Size(rectWidth, rectHeight));
        activePath = new paper.Path.Ellipse(rect);
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleEllipseMouseUp(event) {
    if (activePath) {
        const dragDist = event.point.subtract(event.downPoint).length;
        if (dragDist < 3) {
            activePath.remove();
            activePath = null;
            openShapeOptionsModal('ellipse', event.downPoint);
        } else {
            finishActivePath();
        }
    }
}

// --- PENCIL TOOL (B) ---
function handlePencilMouseDown(event) {
    deselectAll();
    activePath = new paper.Path();
    setupShapeStyles(activePath);
    activePath.selected = true;
    activePath.add(event.point);
}

function handlePencilMouseDrag(event) {
    if (activePath) {
        activePath.add(event.point);
    }
}

function handlePencilMouseUp(event) {
    if (activePath) {
        activePath.simplify(2.5);
        activePath.closed = true;
        
        const path = activePath;
        activePath = null; // Clear activePath to bypass standard finishActivePath
        
        path.selected = true;
        path.fullySelected = true;
        
        saveState();
        updateLayersUI();
        paper.view.draw();
    }
}

// --- ERASER TOOL (Shift+E) ---
let eraserPath = null; // dedicated eraser path reference to avoid activePath collision

function handleEraserMouseDown(event) {
    eraserPath = new paper.Path({
        strokeColor: '#777777',
        strokeWidth: 20,
        strokeCap: 'round',
        opacity: 0.5
    });
    eraserPath.add(event.point);
}

function handleEraserMouseDrag(event) {
    if (eraserPath) {
        eraserPath.add(event.point);
    }
}

function handleEraserMouseUp(event) {
    if (!eraserPath) return;
    
    const eraserStroke = eraserPath;
    eraserPath = null;
    eraserStroke.remove();
    
    const drawItems = [...paper.project.activeLayer.children];
    let changed = false;
    
    drawItems.forEach(item => {
        if (!item || !item.isInserted()) return;
        if (item.layer && item.layer.name === 'System Artboard') return;
        
        if (item.bounds && eraserStroke.bounds && item.bounds.intersects(eraserStroke.bounds)) {
            if (item instanceof paper.Path && (item.closed || item.fillColor)) {
                try {
                    const pathOutline = item.subtract(eraserStroke);
                    if (pathOutline && Math.abs((pathOutline.area || 0) - (item.area || 0)) > 1) {
                        item.replaceWith(pathOutline);
                        pathOutline.selected = true;
                        changed = true;
                    }
                } catch(err) {
                    try {
                        if (item.isInserted() && eraserStroke.contains(item.position)) {
                            item.remove();
                            changed = true;
                        }
                    } catch(e2) {}
                }
            } else if (item instanceof paper.Path) {
                try {
                    const intersections = item.getIntersections(eraserStroke);
                    if (intersections.length > 0) {
                        item.remove();
                        changed = true;
                    }
                } catch(e) {}
            } else if (item instanceof paper.PointText) {
                item.remove();
                changed = true;
            }
        }
    });
    
    if (changed) {
        saveState();
    } else {
        onSelectionChanged();
    }
    paper.view.draw();
}

// --- HAND TOOL / PAN (H) ---
function handleHandMouseDown(event) {}

function handleHandMouseDrag(event) {
    const delta = event.point.subtract(event.downPoint);
    paper.view.center = paper.view.center.subtract(delta);
}

function handleHandMouseUp(event) {}

// --- ZOOM TOOL (Z) ---
let zoomStartClientX = 0;
let zoomStartClientY = 0;
let zoomStartLevel = 1;
let zoomStartPoint = null;
let zoomHasDragged = false;

function handleZoomMouseDown(event) {
    applyVirtualModifiers(event);
    
    // Store initial positions in screen/DOM coordinates
    zoomStartClientX = event.event ? event.event.clientX : event.point.x;
    zoomStartClientY = event.event ? event.event.clientY : event.point.y;
    zoomStartLevel = state.zoomLevel;
    zoomStartPoint = event.downPoint;
    zoomHasDragged = false;
}

function handleZoomMouseDrag(event) {
    applyVirtualModifiers(event);
    if (!zoomStartPoint) return;
    
    const clientX = event.event ? event.event.clientX : event.point.x;
    const clientY = event.event ? event.event.clientY : event.point.y;
    
    const dx = clientX - zoomStartClientX;
    const dy = clientY - zoomStartClientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 3) {
        zoomHasDragged = true;
    }
    
    if (zoomHasDragged) {
        // Dragging right zooms in, dragging left zooms out
        const delta = dx; 
        
        // Exponential zoom: 150px drag to double/halve zoom level
        const zoomFactor = Math.pow(2, delta / 150);
        const newZoom = zoomStartLevel * zoomFactor;
        
        setZoomLevel(newZoom, zoomStartPoint);
        paper.view.draw();
    }
}

function handleZoomMouseUp(event) {
    applyVirtualModifiers(event);
    
    // If it was just a click without dragging, perform a standard step zoom
    if (!zoomHasDragged) {
        let factor = 1.3;
        if (event.modifiers.alt) {
            factor = 1 / 1.3;
        }
        const newZoom = state.zoomLevel * factor;
        setZoomLevel(newZoom, event.point);
    }
    
    // Reset state tracking
    zoomStartPoint = null;
    zoomHasDragged = false;
}

// --- ROTATE TOOL (R) ---
let rotatePivot = null;
function handleRotateMouseDown(event) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        let totalBounds = null;
        selection.forEach(item => {
            if (!totalBounds) totalBounds = item.bounds.clone();
            else totalBounds = totalBounds.unite(item.bounds);
        });
        rotatePivot = totalBounds.center;
    }
}

function handleRotateMouseDrag(event) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0 && rotatePivot) {
        const prevVector = event.lastPoint.subtract(rotatePivot);
        const currVector = event.point.subtract(rotatePivot);
        const angle = currVector.angle - prevVector.angle;
        
        selection.forEach(item => {
            item.rotate(angle, rotatePivot);
        });
        updateSelectionVisualState();
    }
}

function handleRotateMouseUp(event) {
    if (rotatePivot) {
        saveState();
        rotatePivot = null;
    }
}

// -------------------------------------------------------------
// HELPER FUNCTIONS & STYLING APPLICATION
// -------------------------------------------------------------

function deselectAll() {
    paper.project.selectedItems.forEach(item => {
        item.selected = false;
        item.fullySelected = false;
    });
    onSelectionChanged();
}

let selectionBoxPath = null;
let selectionHandlePaths = [];

function clearSelectionVisuals() {
    if (selectionBoxPath) {
        selectionBoxPath.remove();
        selectionBoxPath = null;
    }
    selectionHandlePaths.forEach(h => h.remove());
    selectionHandlePaths = [];
}

function updateSelectionVisualState() {
    clearSelectionVisuals();
    
    const selected = getSelectedDrawItems();
    const isDirectSelect = (state.activeToolName === 'direct-select');
    
    selected.forEach(item => {
        if (isDirectSelect) {
            item.fullySelected = true;
        } else {
            item.fullySelected = false;
            item.selected = true;
        }
    });

    if (state.activeToolName === 'select' && selected.length > 0) {
        const bounds = getSelectionBounds();
        if (bounds) {
            const prevActiveLayer = paper.project.activeLayer;
            if (artboardLayer) {
                artboardLayer.activate();
                
                selectionBoxPath = new paper.Path.Rectangle({
                    rectangle: bounds,
                    strokeColor: '#00a8ff',
                    strokeWidth: 1.2 / paper.view.zoom,
                    fillColor: null,
                    insert: true
                });
                selectionBoxPath.locked = true;
                selectionBoxPath.data = { isSelectionHelper: true };
                
                const handles = getSelectionHandles(bounds);
                const handleSize = 6 / paper.view.zoom;
                for (const [name, point] of Object.entries(handles)) {
                    const handlePath = new paper.Path.Rectangle({
                        center: point,
                        size: [handleSize, handleSize],
                        fillColor: '#ffffff',
                        strokeColor: '#00a8ff',
                        strokeWidth: 1.2 / paper.view.zoom,
                        insert: true
                    });
                    handlePath.locked = true;
                    handlePath.data = { isSelectionHelper: true };
                    selectionHandlePaths.push(handlePath);
                }
            }
            if (prevActiveLayer) {
                prevActiveLayer.activate();
            }
        }
    }
}

function onSelectionChanged() {
    updateSelectionVisualState();
    updateSelectionInfo();
    syncPropertiesFromSelection();
    updateLayersUI();
    syncArtboardInputs();
}

function convertPixelsToUnit(pixels, unit, ppi) {
    switch (unit) {
        case 'in':
            return parseFloat((pixels / ppi).toFixed(2));
        case 'cm':
            return parseFloat((pixels / (ppi / 2.54)).toFixed(2));
        case 'mm':
            return parseFloat((pixels / (ppi / 25.4)).toFixed(1));
        default: // 'px'
            return Math.round(pixels);
    }
}

function convertUnitToPixels(value, unit, ppi) {
    switch (unit) {
        case 'in':
            return Math.round(value * ppi);
        case 'cm':
            return Math.round(value * (ppi / 2.54));
        case 'mm':
            return Math.round(value * (ppi / 25.4));
        default: // 'px'
            return Math.round(value);
    }
}

function syncArtboardInputs() {
    const wInput = document.getElementById('artboard-w-input');
    const hInput = document.getElementById('artboard-h-input');
    const unitSelect = document.getElementById('artboard-unit-select');
    const resInput = document.getElementById('artboard-res-input');
    
    if (unitSelect) unitSelect.value = state.artboardUnit;
    if (resInput) resInput.value = state.artboardResolution;
    
    if (wInput) {
        wInput.value = convertPixelsToUnit(state.artboardWidth, state.artboardUnit, state.artboardResolution);
    }
    if (hInput) {
        hInput.value = convertPixelsToUnit(state.artboardHeight, state.artboardUnit, state.artboardResolution);
    }
}

function updateArtboardSize(width, height) {
    if (isNaN(width) || width <= 10 || isNaN(height) || height <= 10) return;
    
    state.artboardWidth = width;
    state.artboardHeight = height;
    
    if (artboardLayer) {
        artboardLayer.locked = false;
        artboardLayer.activate();
        
        artboardLayer.data.artboardUnit = state.artboardUnit;
        artboardLayer.data.artboardResolution = state.artboardResolution;
        
        if (artboardShadow) artboardShadow.remove();
        if (artboardRect) artboardRect.remove();
        if (gridGroup) gridGroup.remove();
        
        artboardShadow = new paper.Path.Rectangle({
            point: [204, 154],
            size: [state.artboardWidth, state.artboardHeight],
            fillColor: '#121212',
            opacity: 0.4
        });
        artboardShadow.name = 'artboardShadow';
        
        artboardRect = new paper.Path.Rectangle({
            point: [200, 150],
            size: [state.artboardWidth, state.artboardHeight],
            fillColor: state.artboardBgColor || '#ffffff',
            strokeColor: '#555555',
            strokeWidth: 1
        });
        artboardRect.name = 'artboardRect';
        
        gridGroup = new paper.Group();
        gridGroup.name = 'gridGroup';
        
        const gridSpacing = 50;
        
        for (let x = 200 + gridSpacing; x < 200 + state.artboardWidth; x += gridSpacing) {
            let line = new paper.Path.Line({
                from: [x, 150],
                to: [x, 150 + state.artboardHeight],
                strokeColor: '#f0f0f0',
                strokeWidth: 1
            });
            gridGroup.addChild(line);
        }
        for (let y = 150 + gridSpacing; y < 150 + state.artboardHeight; y += gridSpacing) {
            let line = new paper.Path.Line({
                from: [200, y],
                to: [200 + state.artboardWidth, y],
                strokeColor: '#f0f0f0',
                strokeWidth: 1
            });
            gridGroup.addChild(line);
        }
        
        artboardLayer.addChild(artboardShadow);
        artboardLayer.addChild(artboardRect);
        artboardLayer.addChild(gridGroup);
        
        // Sync window references so PDF export and artboard tool always see the current rect
        window.artboardRect   = artboardRect;
        window.artboardShadow = artboardShadow;
        window.gridGroup      = gridGroup;

        // Update isMain entry in multiArtboards if present
        if (window.multiArtboards) {
            const mainEntry = window.multiArtboards.find(a => a.isMain);
            if (mainEntry) {
                mainEntry.rect   = artboardRect;
                mainEntry.shadow = artboardShadow;
                mainEntry.grid   = gridGroup;
            }
        }

        artboardLayer.locked = true;
        
        if (drawLayer) drawLayer.activate();
        
        paper.view.draw();
        saveState();
    }
}

// Resize a secondary (multi) artboard selected with the Artboard Tool
function resizeSelectedSecondaryArtboard(newW, newH) {
    const ab = window._selectedArtboard;
    if (!ab || !ab.rect || !ab.rect.isInserted()) return;

    const oldBounds = ab.rect.bounds;
    const w = (newW !== null && newW > 0) ? newW : oldBounds.width;
    const h = (newH !== null && newH > 0) ? newH : oldBounds.height;
    const ox = oldBounds.x;
    const oy = oldBounds.y;

    // Unlock artboard layer temporarily so we can add/remove items from it
    const wasLocked = window.artboardLayer ? window.artboardLayer.locked : false;
    if (window.artboardLayer) {
        window.artboardLayer.locked = false;
        window.artboardLayer.activate();
    }

    // Remove old visual parts cleanly
    try { if (ab.shadow && ab.shadow.isInserted()) ab.shadow.remove(); } catch (_) {}
    try { if (ab.rect   && ab.rect.isInserted())   ab.rect.remove();   } catch (_) {}
    try { if (ab.grid   && ab.grid.isInserted())   ab.grid.remove();   } catch (_) {}
    try { if (ab.label  && ab.label.isInserted())  ab.label.remove();  } catch (_) {}

    // Rebuild artboard at same top-left origin, new size
    const shadow = new paper.Path.Rectangle({
        point: [ox + 4, oy + 4],
        size: [w, h],
        fillColor: '#121212',
        opacity: 0.4
    });
    const rect = new paper.Path.Rectangle({
        point: [ox, oy],
        size: [w, h],
        fillColor: '#ffffff',
        strokeColor: '#555555',
        strokeWidth: 1
    });
    rect.name = 'artboardRect';

    // Rebuild grid lines
    const grid = new paper.Group();
    const gs = 50;
    for (let x = ox + gs; x < ox + w; x += gs) {
        grid.addChild(new paper.Path.Line({
            from: [x, oy], to: [x, oy + h],
            strokeColor: '#f0f0f0', strokeWidth: 0.5
        }));
    }
    for (let y = oy + gs; y < oy + h; y += gs) {
        grid.addChild(new paper.Path.Line({
            from: [ox, y], to: [ox + w, y],
            strokeColor: '#f0f0f0', strokeWidth: 0.5
        }));
    }

    // Update the tracked artboard object
    ab.shadow = shadow;
    ab.rect   = rect;
    ab.grid   = grid;
    ab.bounds = rect.bounds;

    // Lock artboard layer again and restore draw layer as active
    if (window.artboardLayer) window.artboardLayer.locked = true;
    const dl = window.drawLayer ||
        paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
    if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }

    // Sync inputs to new size
    _syncArtboardInputsToSelected();

    paper.view.draw();
    autoSaveProject();
}

function setupShapeStyles(path) {
    if (state.fillColorNone) {
        path.fillColor = null;
    } else {
        path.fillColor = state.fillColor;
    }
    
    if (state.strokeColorNone || state.strokeWidth <= 0) {
        path.strokeColor = null;
    } else {
        path.strokeColor = state.strokeColor;
        path.strokeWidth = state.strokeWidth;
    }
    
    path.opacity = state.opacity / 100;
}

function applyStylesToSelection() {
    const selected = getSelectedDrawItems();
    if (selected.length === 0) return;
    
    selected.forEach(item => {
        if (state.fillColorNone) {
            item.fillColor = null;
        } else {
            item.fillColor = state.fillColor;
        }
        
        if (state.strokeColorNone || state.strokeWidth <= 0) {
            item.strokeColor = null;
        } else {
            item.strokeColor = state.strokeColor;
            item.strokeWidth = state.strokeWidth;
        }
        
        item.opacity = state.opacity / 100;
    });
    
    paper.view.draw();
    saveState();
}

function getSelectedDrawItems() {
    return paper.project.selectedItems.filter(item => {
        return item.layer.name !== 'System Artboard';
    });
}

function getTopLevelSelectedDrawItems() {
    const selection = getSelectedDrawItems();
    return selection.filter(item => {
        let parent = item.parent;
        while (parent) {
            if (selection.includes(parent)) {
                return false;
            }
            parent = parent.parent;
        }
        return true;
    });
}

function syncPropertiesFromSelection() {
    const selection = getSelectedDrawItems();
    if (selection.length === 0) return;
    
    const item = selection[0];
    
    if (item.fillColor) {
        state.fillColor = item.fillColor.toCSS(true);
        state.fillColorNone = false;
        document.getElementById('fill-color').value = state.fillColor;
        document.getElementById('toolbar-fill-indicator').style.backgroundColor = state.fillColor;
        document.getElementById('toolbar-fill-indicator').classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
    } else {
        state.fillColorNone = true;
        document.getElementById('toolbar-fill-indicator').classList.add('none');
        document.getElementById('btn-fill-none').classList.add('active');
    }
    
    if (item.strokeColor) {
        state.strokeColor = item.strokeColor.toCSS(true);
        state.strokeColorNone = false;
        document.getElementById('stroke-color').value = state.strokeColor;
        document.getElementById('toolbar-stroke-indicator').style.borderColor = state.strokeColor;
        document.getElementById('toolbar-stroke-indicator').classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
    } else {
        state.strokeColorNone = true;
        document.getElementById('toolbar-stroke-indicator').classList.add('none');
        document.getElementById('btn-stroke-none').classList.add('active');
    }
    
    if (item.strokeWidth) {
        state.strokeWidth = item.strokeWidth;
        document.getElementById('stroke-width').value = Math.round(item.strokeWidth);
    }
    
    if (item.opacity !== undefined) {
        state.opacity = Math.round(item.opacity * 100);
        document.getElementById('opacity-slider').value = state.opacity;
        document.getElementById('opacity-val').innerText = `${state.opacity}%`;
    }
    
    document.getElementById('prop-transform-x').value = Math.round(item.bounds.x);
    document.getElementById('prop-transform-y').value = Math.round(item.bounds.y);
    document.getElementById('prop-transform-w').value = Math.round(item.bounds.width);
    document.getElementById('prop-transform-h').value = Math.round(item.bounds.height);
    
    if (item.strokeCap) {
        document.getElementById('prop-stroke-cap').value = item.strokeCap;
    }
    if (item.strokeJoin) {
        document.getElementById('prop-stroke-join').value = item.strokeJoin;
    }
    if (item.dashArray && item.dashArray.length > 0) {
        const styleEl = document.getElementById('stroke-style');
        if (styleEl) styleEl.value = 'dashed';
    } else {
        const styleEl = document.getElementById('stroke-style');
        if (styleEl) styleEl.value = 'solid';
    }

    if (item.data) {
        const startEl = document.getElementById('stroke-arrow-start');
        const endEl   = document.getElementById('stroke-arrow-end');
        if (startEl) startEl.value = item.data.arrowStart || 'none';
        if (endEl)   endEl.value   = item.data.arrowEnd   || 'none';
    }

    if (item.dashArray) {
        document.getElementById('prop-dash-array').value = item.dashArray.join(', ');
    } else {
        document.getElementById('prop-dash-array').value = '';
    }
    
    // Sync font controls for PointText items
    if (item instanceof paper.PointText && window.__syncTypeFontControls) {
        window.__syncTypeFontControls(item);
    }
}

// -------------------------------------------------------------
// ZOOM & PANNING MECHANICS
// -------------------------------------------------------------
function setZoomLevel(level, centerPoint = paper.view.center) {
    const clampedZoom = Math.min(state.maxZoom, Math.max(state.minZoom, level));
    state.zoomLevel = clampedZoom;
    
    const view = paper.view;
    const beta = view.zoom;
    view.zoom = clampedZoom;
    
    const offset = centerPoint.subtract(view.center);
    const newCenter = centerPoint.subtract(offset.multiply(beta / clampedZoom));
    view.center = newCenter;
    
    const zoomPct = Math.round(clampedZoom * 100);
    document.getElementById('zoom-percentage-input').value = `${zoomPct}%`;
    document.querySelector('.doc-tab-title').innerText = `Untitled-1 @ ${zoomPct}% (RGB/Preview)`;
    updateSelectionVisualState();
}

function fitArtboardToScreen() {
    const view = paper.view;
    const viewWidth = view.element.clientWidth;
    const viewHeight = view.element.clientHeight;
    
    view.center = new paper.Point(200 + state.artboardWidth / 2, 150 + state.artboardHeight / 2);
    
    const scaleX = (viewWidth - 100) / state.artboardWidth;
    const scaleY = (viewHeight - 100) / state.artboardHeight;
    const fitZoom = Math.min(scaleX, scaleY, 1.5);
    
    setZoomLevel(fitZoom);
}

// -------------------------------------------------------------
// SELECTION INFO BAR & UI INDICATORS
// -------------------------------------------------------------
function updateSelectionInfo() {
    const selected = getSelectedDrawItems();
    const info = document.getElementById('selection-info');
    
    if (selected.length === 0) {
        info.innerText = "No Selection";
        return;
    }
    
    if (selected.length === 1) {
        const item = selected[0];
        let name = "Item";
        if (item instanceof paper.Path) {
            name = item.closed ? "Path (Closed)" : "Path (Open)";
            if (item.className === 'Rectangle') name = "Rectangle";
            else if (item.className === 'Ellipse') name = "Ellipse";
        } else if (item instanceof paper.PointText) {
            name = "Text Label";
        } else if (item instanceof paper.Group) {
            name = "Group";
        }
        info.innerText = `${name} Selected`;
    } else {
        info.innerText = `${selected.length} Objects Selected`;
    }
}

// -------------------------------------------------------------
// UNDO & REDO CORE (JSON-BASED STATE STACK)
// -------------------------------------------------------------
function saveState() {
    // Clear future Redo history on new action
    state.redoStack = [];
    
    clearSelectionVisuals();
    
    // Export entire project to JSON string
    const jsonString = paper.project.exportJSON();
    state.undoStack.push(jsonString);
    
    if (state.undoStack.length > state.maxHistory) {
        state.undoStack.shift();
    }
    
    onSelectionChanged();
}

function undo() {
    if (state.undoStack.length <= 1) return;
    
    const current = state.undoStack.pop();
    state.redoStack.push(current);
    
    const prevState = state.undoStack[state.undoStack.length - 1];
    loadStateString(prevState);
}

function redo() {
    if (state.redoStack.length === 0) return;
    
    const nextState = state.redoStack.pop();
    state.undoStack.push(nextState);
    loadStateString(nextState);
}

function loadStateString(jsonString) {
    // Clear project
    paper.project.clear();
    
    // Import project
    paper.project.importJSON(jsonString);
    
    // Re-resolve System Artboard variables
    artboardLayer = paper.project.layers.find(l => l.name === 'System Artboard');
    if (artboardLayer) {
        artboardRect = artboardLayer.children['artboardRect'];
        artboardShadow = artboardLayer.children['artboardShadow'];
        gridGroup = artboardLayer.children['gridGroup'];
        
        if (artboardRect) {
            state.artboardWidth = Math.round(artboardRect.bounds.width);
            state.artboardHeight = Math.round(artboardRect.bounds.height);
        }
        
        if (artboardLayer.data) {
            if (artboardLayer.data.artboardUnit) {
                state.artboardUnit = artboardLayer.data.artboardUnit;
            }
            if (artboardLayer.data.artboardResolution) {
                state.artboardResolution = artboardLayer.data.artboardResolution;
            }
        }

        // ── Enforce correct PPI ──────────────────────────────
        // If restored state has wrong PPI (e.g. old 96ppi save),
        // recalculate from actual artboard pixel dimensions.
        // Standard: 8.5in × 11in at 300ppi = 2550 × 3300px
        //           8.5in × 11in at 96ppi  =  816 × 1056px
        if (state.artboardUnit === 'in' || !state.artboardUnit) {
            const w = state.artboardWidth, h = state.artboardHeight;
            // Detect 300ppi letter
            if (Math.abs(w - 2550) < 10 && Math.abs(h - 3300) < 10) {
                state.artboardResolution = 300; state.artboardUnit = 'in';
            }
            // Detect 96ppi letter — upgrade to 300ppi record
            else if (Math.abs(w - 816) < 10 && Math.abs(h - 1056) < 10) {
                state.artboardResolution = 96; state.artboardUnit = 'in';
            }
            // Generic: if ppi stored is clearly wrong (e.g. 0 or 1), use 300
            else if (!state.artboardResolution || state.artboardResolution < 10) {
                state.artboardResolution = 300;
            }
        }
        // Always ensure artboardUnit is set
        if (!state.artboardUnit) state.artboardUnit = 'in';
    }
    
    // Re-resolve drawing layer
    const drawingLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
    if (drawingLayers.length === 0) {
        drawLayer = new paper.Layer();
        drawLayer.name = 'Layer 1';
        drawLayer.activate();
    } else {
        // Active layer is restored by importJSON, make sure it is valid
        drawLayer = paper.project.activeLayer;
        if (drawLayer.name === 'System Artboard') {
            drawLayer = drawingLayers[drawingLayers.length - 1];
            drawLayer.activate();
        }
    }
    
    updateLayersUI();
    deselectAll();
    paper.view.draw();
}

// -------------------------------------------------------------
// EVENT LISTENERS FOR CONTROLS & SIDE PANEL SWITCHES
// -------------------------------------------------------------
function setupUIEventListeners() {
    // --- Toolbar Tool Buttons Click ---
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (state.activeToolName === 'pen' && activePath) {
                finishActivePath();
            }
            
            state.activeToolName = btn.dataset.tool;
            
            // Show gradient tool panel when gradient tool selected, hide otherwise
            if (btn.dataset.tool === 'gradient') {
                if (window.showGradientToolPanel) showGradientToolPanel();
            } else {
                if (window.hideGradientToolPanel) hideGradientToolPanel();
            }

            let toolNiceName = btn.title.split(' (')[0];
            document.getElementById('active-tool-indicator').innerHTML = `${btn.innerHTML} ${toolNiceName}`;
            
            updateSelectionVisualState();
            paper.view.draw();
        });
    });

    // --- Fill & Stroke color picker selectors ---
    document.getElementById('fill-color').addEventListener('input', (e) => {
        state.fillColor = e.target.value;
        state.fillColorNone = false;
        document.getElementById('toolbar-fill-indicator').style.backgroundColor = e.target.value;
        document.getElementById('toolbar-fill-indicator').classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
        applyStylesToSelection();
    });

    document.getElementById('stroke-color').addEventListener('input', (e) => {
        state.strokeColor = e.target.value;
        state.strokeColorNone = false;
        document.getElementById('toolbar-stroke-indicator').style.borderColor = e.target.value;
        document.getElementById('toolbar-stroke-indicator').classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
        applyStylesToSelection();
    });

    document.getElementById('stroke-width').addEventListener('input', (e) => {
        state.strokeWidth = parseFloat(e.target.value) || 0;
        applyStylesToSelection();
    });

    // --- No Fill / No Stroke toggles ---
    document.getElementById('btn-fill-none').addEventListener('click', () => {
        state.fillColorNone = !state.fillColorNone;
        const fillInd = document.getElementById('toolbar-fill-indicator');
        const fillBtn = document.getElementById('btn-fill-none');
        
        if (state.fillColorNone) {
            fillInd.classList.add('none');
            fillBtn.classList.add('active');
        } else {
            fillInd.classList.remove('none');
            fillBtn.classList.remove('active');
        }
        applyStylesToSelection();
    });

    document.getElementById('btn-stroke-none').addEventListener('click', () => {
        state.strokeColorNone = !state.strokeColorNone;
        const strokeInd = document.getElementById('toolbar-stroke-indicator');
        const strokeBtn = document.getElementById('btn-stroke-none');
        
        if (state.strokeColorNone) {
            strokeInd.classList.add('none');
            strokeBtn.classList.add('active');
        } else {
            strokeInd.classList.remove('none');
            strokeBtn.classList.remove('active');
        }
        applyStylesToSelection();
    });

    // --- Opacity slider ---
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        state.opacity = parseInt(e.target.value);
        document.getElementById('opacity-val').innerText = `${state.opacity}%`;
        // Only change opacity — do NOT call applyStylesToSelection() which
        // would overwrite gradient fills with the plain state.fillColor
        const items = getSelectedDrawItems();
        items.forEach(item => {
            item.opacity = state.opacity / 100;
        });
        paper.view.draw();
        saveState();
    });

    // --- Toolbar color target selection ---
    document.getElementById('toolbar-fill-indicator').addEventListener('click', () => {
        state.activeColorTarget = 'fill';
        document.getElementById('toolbar-fill-indicator').classList.add('active');
        document.getElementById('toolbar-stroke-indicator').classList.remove('active');
    });
    
    document.getElementById('toolbar-fill-indicator').addEventListener('dblclick', () => {
        document.getElementById('fill-color').click();
    });

    document.getElementById('toolbar-stroke-indicator').addEventListener('click', () => {
        state.activeColorTarget = 'stroke';
        document.getElementById('toolbar-stroke-indicator').classList.add('active');
        document.getElementById('toolbar-fill-indicator').classList.remove('active');
    });
    
    document.getElementById('toolbar-stroke-indicator').addEventListener('dblclick', () => {
        document.getElementById('stroke-color').click();
    });

    // --- Swap / Default buttons ---
    document.getElementById('btn-swap-colors').addEventListener('click', swapFillAndStrokeColors);
    document.getElementById('btn-default-colors').addEventListener('click', resetDefaultColors);

    // --- Zoom In/Out Status Bar controls ---
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        setZoomLevel(state.zoomLevel * 1.25);
    });
    
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        setZoomLevel(state.zoomLevel / 1.25);
    });
    
    document.getElementById('zoom-percentage-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                setZoomLevel(val / 100);
            }
        }
    });

    // --- Artboard Width & Height & Resolution & Unit controls ---
    document.getElementById('artboard-unit-select').addEventListener('change', (e) => {
        state.artboardUnit = e.target.value;
        syncArtboardInputs();
    });

    const handleArtboardResChange = (newRes) => {
        if (isNaN(newRes) || newRes <= 0) {
            syncArtboardInputs();
            return;
        }
        
        const oldRes = state.artboardResolution;
        if (oldRes === newRes) return;
        
        if (state.artboardUnit !== 'px') {
            const wPhysical = convertPixelsToUnit(state.artboardWidth, state.artboardUnit, oldRes);
            const hPhysical = convertPixelsToUnit(state.artboardHeight, state.artboardUnit, oldRes);
            
            const newWPixels = convertUnitToPixels(wPhysical, state.artboardUnit, newRes);
            const newHPixels = convertUnitToPixels(hPhysical, state.artboardUnit, newRes);
            
            state.artboardResolution = newRes;
            updateArtboardSize(newWPixels, newHPixels);
        } else {
            state.artboardResolution = newRes;
            saveState();
        }
    };

    document.getElementById('artboard-res-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseInt(e.target.value);
            handleArtboardResChange(val);
            e.target.blur();
        }
    });
    document.getElementById('artboard-res-input').addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        handleArtboardResChange(val);
    });

    const handleArtboardWChange = (val) => {
        if (isNaN(val) || val <= 0) { syncArtboardInputs(); return; }
        const newWPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        const sel = window._selectedArtboard;
        if (state.activeToolName === 'artboard' && sel) {
            if (sel === 'main') {
                // Resize the main artboard
                updateArtboardSize(newWPixels, state.artboardHeight);
            } else if (sel.rect && !sel.isMain) {
                // Resize only the selected secondary artboard
                resizeSelectedSecondaryArtboard(newWPixels, null);
            } else {
                // isMain entry = main artboard reference
                updateArtboardSize(newWPixels, state.artboardHeight);
            }
        } else {
            if (newWPixels !== state.artboardWidth) updateArtboardSize(newWPixels, state.artboardHeight);
        }
    };

    document.getElementById('artboard-w-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const val = parseFloat(e.target.value); handleArtboardWChange(val); e.target.blur(); }
    });
    document.getElementById('artboard-w-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value); handleArtboardWChange(val);
    });

    const handleArtboardHChange = (val) => {
        if (isNaN(val) || val <= 0) { syncArtboardInputs(); return; }
        const newHPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        const sel = window._selectedArtboard;
        if (state.activeToolName === 'artboard' && sel) {
            if (sel === 'main') {
                // Resize the main artboard
                updateArtboardSize(state.artboardWidth, newHPixels);
            } else if (sel.rect && !sel.isMain) {
                // Resize only the selected secondary artboard
                resizeSelectedSecondaryArtboard(null, newHPixels);
            } else {
                // isMain entry = main artboard reference
                updateArtboardSize(state.artboardWidth, newHPixels);
            }
        } else {
            if (newHPixels !== state.artboardHeight) updateArtboardSize(state.artboardWidth, newHPixels);
        }
    };

    document.getElementById('artboard-h-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const val = parseFloat(e.target.value); handleArtboardHChange(val); e.target.blur(); }
    });
    document.getElementById('artboard-h-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value); handleArtboardHChange(val);
    });

    // --- Menu File actions ---
    document.getElementById('btn-new').addEventListener('click', () => {
        if (confirm("Create a new document? All unsaved work will be cleared.")) {
            const drawLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
            drawLayers.forEach(l => l.remove());
            
            drawLayer = new paper.Layer();
            drawLayer.name = 'Layer 1';
            drawLayer.activate();
            
            fitArtboardToScreen();
            
            state.undoStack = [];
            state.redoStack = [];
            saveState();
            updateLayersUI();
            deselectAll();
            paper.view.draw();
        }
    });

    document.getElementById('btn-import-svg').addEventListener('click', () => {
        document.getElementById('svg-file-input').click();
    });

    document.getElementById('svg-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                
                // Parse SVG to extract dimensions
                let svgWidth = 800;
                let svgHeight = 600;
                try {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(text, 'image/svg+xml');
                    const svgElement = svgDoc.documentElement;
                    const viewBox = svgElement.getAttribute('viewBox');
                    
                    if (viewBox) {
                        const parts = viewBox.split(/[ ,]+/);
                        if (parts.length === 4) {
                            svgWidth = parseFloat(parts[2]);
                            svgHeight = parseFloat(parts[3]);
                        }
                    }
                    const widthAttr = svgElement.getAttribute('width');
                    const heightAttr = svgElement.getAttribute('height');
                    if (widthAttr && !widthAttr.includes('%')) {
                        svgWidth = parseFloat(widthAttr);
                    }
                    if (heightAttr && !heightAttr.includes('%')) {
                        svgHeight = parseFloat(heightAttr);
                    }
                } catch (err) {
                    console.error("Error parsing SVG dimensions:", err);
                }
                
                // Reset artboard background color to default white before applying SVG's
                state.artboardBgColor = '#ffffff';
                
                // Update workspace artboard size to match the imported SVG
                updateArtboardSize(svgWidth, svgHeight);
                syncArtboardInputs();
                
                paper.project.importSVG(text, {
                    expandShapes: false,
                    insert: true,
                    onLoad: (item) => {
                        // Align the imported item exactly centered on the resized artboard
                        item.position = new paper.Point(200 + svgWidth / 2, 150 + svgHeight / 2);
                        
                        deselectAll();
                        
                        // If it's a group (representing the root <svg>), ungroup its direct children
                        if (item instanceof paper.Group) {
                            const children = [...item.children];
                            const parent = item.parent;
                            const index = item.index;
                            
                            // Detect if any child acts as a redundant artboard/background
                            let bgItem = null;
                            for (let i = 0; i < children.length; i++) {
                                const child = children[i];
                                if (child instanceof paper.Path && 
                                    Math.abs(child.bounds.width - svgWidth) < 5 && 
                                    Math.abs(child.bounds.height - svgHeight) < 5) {
                                    bgItem = child;
                                    break;
                                }
                            }
                            
                            // If a background item is found, apply its fill to our workspace artboard and remove it
                            if (bgItem) {
                                if (bgItem.fillColor) {
                                    try {
                                        state.artboardBgColor = bgItem.fillColor.toCSS ? bgItem.fillColor.toCSS(true) : bgItem.fillColor;
                                        if (artboardRect) {
                                            artboardRect.fillColor = bgItem.fillColor;
                                        }
                                    } catch (e) {
                                        console.error("Error setting artboard fill:", e);
                                    }
                                }
                                // Remove the background path from the children list
                                const bgIndex = children.indexOf(bgItem);
                                if (bgIndex > -1) {
                                    children.splice(bgIndex, 1);
                                }
                                bgItem.remove();
                            }
                            
                            // Insert remaining children into the parent layer at the group's index
                            parent.insertChildren(index, children);
                            // Remove the empty root <svg> group
                            item.remove();
                            
                            // Select all the imported top-level children
                            children.forEach(c => {
                                c.selected = true;
                            });
                        } else {
                            item.selected = true;
                        }
                        
                        // Adjust zoom to fit the newly resized artboard on screen
                        fitArtboardToScreen();
                        
                        saveState();
                        updateLayersUI();
                        paper.view.draw();
                    }
                });
            };
            reader.readAsText(file);
        }
    });

    // Save SVG file download trigger (clean crop)
    document.getElementById('btn-export-svg').addEventListener('click', () => {
        deselectAll();
        
        // Hide visual artboard helpers for clean SVG content
        const artboardVisible = artboardLayer.visible;
        artboardLayer.visible = false;
        paper.view.draw();
        
        const svgStr = paper.project.exportSVG({
            asString: true,
            bounds: artboardRect.bounds // crop clean
        });
        
        artboardLayer.visible = artboardVisible;
        paper.view.draw();
        
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vector_drawing.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // Save PNG file download trigger (clean crop)
    document.getElementById('btn-export-png').addEventListener('click', () => {
        deselectAll();
        
        // Hide Artboard shadow & grids for clean PNG export
        const artboardVisible = artboardLayer.visible;
        artboardShadow.visible = false;
        gridGroup.visible = false;
        artboardRect.strokeColor = null;
        paper.view.draw();
        
        const cleanSVGStr = paper.project.exportSVG({
            asString: true,
            bounds: artboardRect.bounds // crop clean
        });
        
        // Restore elements visual status
        artboardShadow.visible = true;
        gridGroup.visible = true;
        artboardRect.strokeColor = '#555555';
        artboardLayer.visible = artboardVisible;
        paper.view.draw();
        
        // Render SVG to temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.artboardWidth;
        tempCanvas.height = state.artboardHeight;
        const ctx = tempCanvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        const img = new Image();
        const svgBlob = new Blob([cleanSVGStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            
            const pngUrl = tempCanvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = 'vector_drawing.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });

    // Undo & Redo Actions Menu
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm("Clear all items in the active layer?")) {
            paper.project.activeLayer.clear();
            saveState();
            paper.view.draw();
        }
    });

    // Delete selection actions
    document.getElementById('btn-delete').addEventListener('click', deleteSelectedItems);
    document.getElementById('btn-delete-control').addEventListener('click', deleteSelectedItems);
    
    // Zoom fits controls
    document.getElementById('btn-fit-screen').addEventListener('click', fitArtboardToScreen);
    document.getElementById('btn-fit-screen-control').addEventListener('click', fitArtboardToScreen);
    document.getElementById('btn-zoom-in-menu').addEventListener('click', () => setZoomLevel(state.zoomLevel * 1.25));
    document.getElementById('btn-zoom-out-menu').addEventListener('click', () => setZoomLevel(state.zoomLevel / 1.25));

    // Groups & arrangement actions
    document.getElementById('btn-group').addEventListener('click', groupSelectedItems);
    document.getElementById('btn-ungroup').addEventListener('click', ungroupSelectedItems);
    document.getElementById('btn-bring-to-front').addEventListener('click', bringSelectedToFront);
    document.getElementById('btn-send-to-back').addEventListener('click', sendSelectedToBack);

    // Toggle panels
    document.getElementById('toggle-layers-panel').addEventListener('click', (e) => {
        const panel = document.getElementById('right-panels');
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            e.target.innerHTML = '<i class="fa-solid fa-check"></i> Layers Panel';
        } else {
            panel.style.display = 'none';
            e.target.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Layers Panel';
        }
    });

    document.getElementById('toggle-properties-panel').addEventListener('click', (e) => {
        const propTab = document.getElementById('tab-properties');
        if (propTab.style.display === 'none') {
            propTab.style.display = 'flex';
            e.target.innerHTML = '<i class="fa-solid fa-check"></i> Properties Panel';
        } else {
            propTab.style.display = 'none';
            e.target.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Properties Panel';
        }
    });

    // --- Right Sidebar panel switching ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const panelContents = document.querySelectorAll('.panel-content');
    const stripButtons = document.querySelectorAll('.strip-icon-btn');
    
    function switchTab(tabId) {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        panelContents.forEach(p => p.classList.remove('active'));
        stripButtons.forEach(s => s.classList.remove('active'));
        
        const activeTabBtn = document.getElementById(`tab-${tabId}`);
        const activeContent = document.getElementById(`panel-${tabId}-content`);
        const activeStripBtn = document.querySelector(`.strip-icon-btn[data-tab="${tabId}"]`);
        
        if (activeTabBtn) activeTabBtn.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
        if (activeStripBtn) activeStripBtn.classList.add('active');
    }
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.id.replace('tab-', '');
            switchTab(tabId);
        });
    });
    
    stripButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });

    // --- Layers Panel Footer Action Buttons ---
    document.getElementById('layer-new').addEventListener('click', () => {
        const count = paper.project.layers.length;
        const newLayer = new paper.Layer();
        newLayer.name = `Layer ${count}`;
        newLayer.activate();
        updateLayersUI();
    });
    
    document.getElementById('layer-delete').addEventListener('click', () => {
        const selectedItems = getSelectedDrawItems();
        if (selectedItems.length > 0) {
            // Delete the selected drawing items
            selectedItems.forEach(item => item.remove());
            saveState();
            paper.view.draw();
        } else {
            // Delete the active layer
            const activeL = paper.project.activeLayer;
            const drawLayersCount = paper.project.layers.filter(l => l.name !== 'System Artboard').length;
            if (activeL && activeL.name !== 'System Artboard' && drawLayersCount > 1) {
                if (confirm(`Delete layer "${activeL.name}" and all its drawings?`)) {
                    activeL.remove();
                    const remaining = paper.project.layers.filter(l => l.name !== 'System Artboard');
                    remaining[remaining.length - 1].activate();
                    
                    saveState();
                    paper.view.draw();
                }
            } else {
                alert("Cannot delete the only drawing layer!");
            }
        }
    });

    document.getElementById('layer-up').addEventListener('click', () => {
        const activeL = paper.project.activeLayer;
        if (activeL.name === 'System Artboard') return;
        
        const layers = paper.project.layers;
        const idx = layers.indexOf(activeL);
        if (idx < layers.length - 1) {
            activeL.insertAbove(layers[idx + 1]);
            updateLayersUI();
            paper.view.draw();
        }
    });

    document.getElementById('layer-down').addEventListener('click', () => {
        const activeL = paper.project.activeLayer;
        if (activeL.name === 'System Artboard') return;
        
        const layers = paper.project.layers;
        const idx = layers.indexOf(activeL);
        if (idx > 0 && layers[idx - 1].name !== 'System Artboard') {
            activeL.insertBelow(layers[idx - 1]);
            updateLayersUI();
            paper.view.draw();
        }
    });

    // --- Alignment Actions ---
    document.getElementById('align-left').addEventListener('click', () => alignSelection('left'));
    document.getElementById('align-center-h').addEventListener('click', () => alignSelection('centerX'));
    document.getElementById('align-right').addEventListener('click', () => alignSelection('right'));
    document.getElementById('align-top').addEventListener('click', () => alignSelection('top'));
    document.getElementById('align-center-v').addEventListener('click', () => alignSelection('centerY'));
    document.getElementById('align-bottom').addEventListener('click', () => alignSelection('bottom'));

    // --- Properties Panel Input Sync Actions ---
    const transformInputs = ['prop-transform-x', 'prop-transform-y', 'prop-transform-w', 'prop-transform-h'];
    transformInputs.forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const selection = getSelectedDrawItems();
            if (selection.length === 0) return;
            
            const item = selection[0];
            const valX = parseFloat(document.getElementById('prop-transform-x').value);
            const valY = parseFloat(document.getElementById('prop-transform-y').value);
            const valW = parseFloat(document.getElementById('prop-transform-w').value);
            const valH = parseFloat(document.getElementById('prop-transform-h').value);
            
            if (!isNaN(valX) && !isNaN(valY)) {
                item.bounds.x = valX;
                item.bounds.y = valY;
            }
            if (!isNaN(valW) && valW > 0 && !isNaN(valH) && valH > 0) {
                item.bounds.width = valW;
                item.bounds.height = valH;
            }
            
            paper.view.draw();
            saveState();
        });
    });

    document.getElementById('prop-stroke-cap').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.strokeCap = e.target.value);
        paper.view.draw();
        saveState();
    });

    document.getElementById('prop-stroke-join').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.strokeJoin = e.target.value);
        paper.view.draw();
        saveState();
    });

    document.getElementById('prop-dash-array').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        const val = e.target.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        selection.forEach(item => item.dashArray = val.length > 0 ? val : null);
        paper.view.draw();
        saveState();
    });

    document.getElementById('btn-duplicate').addEventListener('click', duplicateSelectedItems);
    document.getElementById('btn-rotate-90').addEventListener('click', () => {
        const inputAngle = document.getElementById('input-rotate-angle');
        const angle = inputAngle ? parseFloat(inputAngle.value) || 90 : 90;
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.rotate(angle));
        paper.view.draw();
        saveState();
    });
    document.getElementById('btn-flip-h').addEventListener('click', () => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.scale(-1, 1));
        paper.view.draw();
        saveState();
    });
    document.getElementById('btn-flip-v').addEventListener('click', () => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.scale(1, -1));
        paper.view.draw();
        saveState();
    });

    // --- Modal dialogue windows (About & Docs) ---
    document.getElementById('btn-about').addEventListener('click', () => {
        document.getElementById('about-modal').classList.add('active');
    });
    document.getElementById('btn-close-about').addEventListener('click', () => {
        document.getElementById('about-modal').classList.remove('active');
    });
    document.getElementById('btn-close-about-ok').addEventListener('click', () => {
        document.getElementById('about-modal').classList.remove('active');
    });
    document.getElementById('btn-docs').addEventListener('click', () => {
        window.open('docs.html', '_blank');
    });

    // --- Custom Shape Dimensions Modal Event Listeners ---
    const shapeModal = document.getElementById('shape-options-modal');
    const shapeWidthInput = document.getElementById('shape-width-input');
    const shapeHeightInput = document.getElementById('shape-height-input');
    const shapeUnitSelect = document.getElementById('shape-unit-select');

    function closeShapeModal() {
        shapeModal.classList.remove('active');
        shapeClickOrigin = null;
        activePath = null;
    }

    document.getElementById('btn-close-shape-modal').addEventListener('click', closeShapeModal);
    document.getElementById('btn-cancel-shape-modal').addEventListener('click', closeShapeModal);

    shapeUnitSelect.addEventListener('change', (e) => {
        const newUnit = e.target.value;
        const oldUnit = lastSelectedModalUnit;
        if (oldUnit === newUnit) return;

        // Convert width value
        const wVal = parseFloat(shapeWidthInput.value);
        if (!isNaN(wVal)) {
            const px = convertUnitToPixels(wVal, oldUnit, state.artboardResolution);
            shapeWidthInput.value = convertPixelsToUnit(px, newUnit, state.artboardResolution);
        }
        // Convert height value
        const hVal = parseFloat(shapeHeightInput.value);
        if (!isNaN(hVal)) {
            const px = convertUnitToPixels(hVal, oldUnit, state.artboardResolution);
            shapeHeightInput.value = convertPixelsToUnit(px, newUnit, state.artboardResolution);
        }

        // Update suffixes
        document.querySelectorAll('.shape-unit-label').forEach(el => el.innerText = newUnit);
        lastSelectedModalUnit = newUnit;
    });

    document.getElementById('btn-ok-shape-modal').addEventListener('click', () => {
        if (!shapeClickOrigin) {
            closeShapeModal();
            return;
        }

        const wVal = parseFloat(shapeWidthInput.value);
        const hVal = parseFloat(shapeHeightInput.value);
        const unit = shapeUnitSelect.value;

        if (isNaN(wVal) || wVal <= 0 || isNaN(hVal) || hVal <= 0) {
            alert('Please enter valid, positive dimensions.');
            return;
        }

        // Convert to pixels
        const wPixels = convertUnitToPixels(wVal, unit, state.artboardResolution);
        const hPixels = convertUnitToPixels(hVal, unit, state.artboardResolution);

        deselectAll();

        if (shapeClickType === 'rect') {
            activePath = new paper.Path.Rectangle({
                point: shapeClickOrigin,
                size: [wPixels, hPixels]
            });
        } else {
            const rect = new paper.Rectangle(shapeClickOrigin, new paper.Size(wPixels, hPixels));
            activePath = new paper.Path.Ellipse(rect);
        }

        setupShapeStyles(activePath);
        activePath.selected = true;

        finishActivePath();
        updateLayersUI();
        paper.view.draw();
        closeShapeModal();
    });

    const handleShapeEnter = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-ok-shape-modal').click();
        }
    };
    shapeWidthInput.addEventListener('keydown', handleShapeEnter);
    shapeHeightInput.addEventListener('keydown', handleShapeEnter);

    shapeModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeShapeModal();
        }
    });
    
    // Workspace Zoom using Mouse Wheel (Alt + Scroll)
    const viewport = document.getElementById('canvas-workspace');
    viewport.addEventListener('wheel', (e) => {
        if (e.altKey || state.virtualAlt) {
            e.preventDefault();
            const viewPoint = paper.view.viewToProject(new paper.Point(e.offsetX, e.offsetY));
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            setZoomLevel(state.zoomLevel * factor, viewPoint);
        }
    }, { passive: false });
    
    // --- Virtual Modifier Keys Floating Widget ---
    const ctrlBtn = document.getElementById('btn-virtual-ctrl');
    const altBtn = document.getElementById('btn-virtual-alt');
    const shiftBtn = document.getElementById('btn-virtual-shift');
    const keypad = document.getElementById('virtual-modifiers-container');
    const keypadHandle = document.getElementById('keypad-drag-handle');
    
    if (ctrlBtn) {
        ctrlBtn.addEventListener('click', () => {
            state.virtualCtrl = !state.virtualCtrl;
            if (state.virtualCtrl) {
                ctrlBtn.classList.add('active');
            } else {
                ctrlBtn.classList.remove('active');
            }
        });
    }
    
    if (altBtn) {
        altBtn.addEventListener('click', () => {
            state.virtualAlt = !state.virtualAlt;
            if (state.virtualAlt) {
                altBtn.classList.add('active');
            } else {
                altBtn.classList.remove('active');
            }
        });
    }
    
    if (shiftBtn) {
        shiftBtn.addEventListener('click', () => {
            state.virtualShift = !state.virtualShift;
            if (state.virtualShift) {
                shiftBtn.classList.add('active');
            } else {
                shiftBtn.classList.remove('active');
            }
        });
    }
    
    if (keypad && keypadHandle) {
        makeElementDraggable(keypad, keypadHandle);
    }
}

// Swap color palette targets
function swapFillAndStrokeColors() {
    const tempColor = state.fillColor;
    const tempNone = state.fillColorNone;
    
    state.fillColor = state.strokeColor;
    state.fillColorNone = state.strokeColorNone;
    
    state.strokeColor = tempColor;
    state.strokeColorNone = tempNone;
    
    const fillInd = document.getElementById('toolbar-fill-indicator');
    const strokeInd = document.getElementById('toolbar-stroke-indicator');
    
    if (state.fillColorNone) {
        fillInd.classList.add('none');
        document.getElementById('btn-fill-none').classList.add('active');
    } else {
        fillInd.style.backgroundColor = state.fillColor;
        fillInd.classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
        document.getElementById('fill-color').value = state.fillColor;
    }
    
    if (state.strokeColorNone) {
        strokeInd.classList.add('none');
        document.getElementById('btn-stroke-none').classList.add('active');
    } else {
        strokeInd.style.borderColor = state.strokeColor;
        strokeInd.classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
        document.getElementById('stroke-color').value = state.strokeColor;
    }
    
    applyStylesToSelection();
}

// Reset colors back to black stroke, white fill
function resetDefaultColors() {
    state.fillColor = '#ffffff';
    state.fillColorNone = false;
    state.strokeColor = '#000000';
    state.strokeColorNone = false;
    state.strokeWidth = 2;
    
    const fillInd = document.getElementById('toolbar-fill-indicator');
    const strokeInd = document.getElementById('toolbar-stroke-indicator');
    
    fillInd.style.backgroundColor = '#ffffff';
    fillInd.classList.remove('none');
    document.getElementById('fill-color').value = '#ffffff';
    document.getElementById('btn-fill-none').classList.remove('active');
    
    strokeInd.style.borderColor = '#000000';
    strokeInd.classList.remove('none');
    document.getElementById('stroke-color').value = '#000000';
    document.getElementById('btn-stroke-none').classList.remove('active');
    document.getElementById('stroke-width').value = 2;
    
    applyStylesToSelection();
}

// -------------------------------------------------------------
// SELECTION MANIPULATIONS (DELETE, GROUP, ARRANGEMENTS, ALIGNS)
// -------------------------------------------------------------
function deleteSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        selection.forEach(item => item.remove());
        saveState();
        paper.view.draw();
    }
}

function duplicateSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        deselectAll();
        selection.forEach(item => {
            const clone = item.clone();
            clone.translate(new paper.Point(20, 20));
            clone.selected = true;
        });
        saveState();
        paper.view.draw();
    }
}

function groupSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 1) {
        const group = new paper.Group(selection);
        deselectAll();
        group.selected = true;
        
        saveState();
        paper.view.draw();
    }
}

function ungroupSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    let groupedFound = false;
    
    selection.forEach(item => {
        if (item instanceof paper.Group) {
            const children = [...item.children];
            item.parent.insertChildren(item.index, children);
            item.remove();
            children.forEach(c => c.selected = true);
            groupedFound = true;
        }
    });
    
    if (groupedFound) {
        saveState();
        paper.view.draw();
    }
}

function bringSelectedToFront() {
    const selection = getTopLevelSelectedDrawItems();
    selection.forEach(item => item.bringToFront());
    saveState();
    paper.view.draw();
}

function sendSelectedToBack() {
    const selection = getTopLevelSelectedDrawItems();
    selection.forEach(item => {
        item.sendToBack();
    });
    paper.view.draw();
    saveState();
}

function alignSelection(type) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length === 0) return;
    
    // Read alignment target from the UI dropdown (defaults to Selection)
    const alignToElement = document.getElementById('align-to-target');
    const alignTo = alignToElement ? alignToElement.value : 'selection';
    
    let bounds = null;
    
    // Determine reference artboard bounds:
    // 1. If artboard tool active and an artboard is selected → use that
    // 2. If alignTo === 'artboard' → find which artboard the items are inside
    // 3. If single item selected → use its containing artboard
    // 4. Fall back to main artboard rect
    function getContainingArtboard(item) {
        // Check secondary artboards
        if (window.multiArtboards) {
            for (const ab of window.multiArtboards) {
                if (ab.isMain) continue;
                if (ab.rect && ab.rect.isInserted() && ab.rect.bounds.intersects(item.bounds)) {
                    return ab.rect.bounds.clone();
                }
            }
        }
        // Fall back to main artboard
        if (window.artboardRect) return window.artboardRect.bounds.clone();
        return paper.view.bounds.clone();
    }

    if (selection.length === 1 || alignTo === 'artboard') {
        // Use selected artboard from artboard tool if active
        if (state.activeToolName === 'artboard' && window._selectedArtboard) {
            if (window._selectedArtboard === 'main' && window.artboardRect) {
                bounds = window.artboardRect.bounds.clone();
            } else if (window._selectedArtboard.rect && window._selectedArtboard.rect.isInserted()) {
                bounds = window._selectedArtboard.rect.bounds.clone();
            }
        }
        // Otherwise detect from first item's position
        if (!bounds) bounds = getContainingArtboard(selection[0]);
        
        selection.forEach(item => {
            switch (type) {
                case 'left':
                    item.bounds.x = bounds.x;
                    break;
                case 'centerX':
                    item.bounds.x = bounds.x + (bounds.width - item.bounds.width) / 2;
                    break;
                case 'right':
                    item.bounds.x = bounds.x + bounds.width - item.bounds.width;
                    break;
                case 'top':
                    item.bounds.y = bounds.y;
                    break;
                case 'centerY':
                    item.bounds.y = bounds.y + (bounds.height - item.bounds.height) / 2;
                    break;
                case 'bottom':
                    item.bounds.y = bounds.y + bounds.height - item.bounds.height;
                    break;
            }
        });
    } else {
        // Align multiple selected items relative to their combined bounds
        selection.forEach(item => {
            if (!bounds) bounds = item.bounds.clone();
            else bounds = bounds.unite(item.bounds);
        });
        
        if (!bounds) return;
        
        selection.forEach(item => {
            switch (type) {
                case 'left':
                    item.bounds.x = bounds.x;
                    break;
                case 'centerX':
                    item.bounds.x = bounds.x + (bounds.width - item.bounds.width) / 2;
                    break;
                case 'right':
                    item.bounds.x = bounds.x + bounds.width - item.bounds.width;
                    break;
                case 'top':
                    item.bounds.y = bounds.y;
                    break;
                case 'centerY':
                    item.bounds.y = bounds.y + (bounds.height - item.bounds.height) / 2;
                    break;
                case 'bottom':
                    item.bounds.y = bounds.y + bounds.height - item.bounds.height;
                    break;
            }
        });
    }
    
    paper.view.draw();
    saveState();
}

// -------------------------------------------------------------
// KEYBOARD SHORTCUTS CONTROLLER
// -------------------------------------------------------------
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const isInputActive = document.activeElement.tagName === 'INPUT' || 
                              document.activeElement.tagName === 'SELECT' || 
                              document.activeElement.tagName === 'TEXTAREA' ||
                              document.activeElement.readOnly === false;
                              
        if (isInputActive) return;
        
        const key = e.key.toLowerCase();
        
        // Finish Pen tool path on Enter or Escape
        if (e.key === 'Escape' || e.key === 'Enter') {
            if (state.activeToolName === 'pen' && activePath) {
                finishActivePath();
                paper.view.draw();
            }
        }
        
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (state.activeToolName !== 'hand') {
                state.prevToolBeforeSpace = state.activeToolName;
                document.getElementById('tool-hand').click();
            }
        }
        
        // Shortcuts mapping
        if (key === 'v') {
            document.getElementById('tool-select').click();
        } else if (key === 'a' && !e.shiftKey) {
            document.getElementById('tool-direct-select').click();
        } else if (key === 'a' && e.shiftKey) {
            document.getElementById('tool-artboard').click();
        } else if (key === 'p') {
            document.getElementById('tool-pen').click();
        } else if (key === 't') {
            document.getElementById('tool-type').click();
        } else if (e.key === '\\') {
            document.getElementById('tool-line').click();
        } else if (key === 'm') {
            document.getElementById('tool-rectangle').click();
        } else if (key === 'l') {
            document.getElementById('tool-ellipse').click();
        } else if (key === 'b') {
            document.getElementById('tool-pencil').click();
        } else if (key === 'g' && !e.ctrlKey && !e.metaKey) {
            document.getElementById('tool-gradient')?.click();
        } else if (key === 'h') {
            document.getElementById('tool-hand').click();
        } else if (key === 'z') {
            document.getElementById('tool-zoom').click();
        } else if (key === 'r') {
            document.getElementById('tool-rotate').click();
        } else if (key === 'e' && (e.shiftKey || state.virtualShift)) {
            document.getElementById('tool-eraser').click();
        } else if (key === 'x' && (e.shiftKey || state.virtualShift)) {
            swapFillAndStrokeColors();
        } else if (key === 'd') {
            resetDefaultColors();
        }
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.activeToolName === 'artboard') {
                // Delete selected artboard
                if (_artboardToolSelectedAb && _artboardToolSelectedAb !== 'main' && window.multiArtboards) {
                    if (confirm('Delete this artboard?')) {
                        try { _artboardToolSelectedAb.group?.remove(); } catch(_) {}
                        try { _artboardToolSelectedAb.rect?.remove(); } catch(_) {}
                        try { _artboardToolSelectedAb.shadow?.remove(); } catch(_) {}
                        const idx = window.multiArtboards.indexOf(_artboardToolSelectedAb);
                        if (idx !== -1) window.multiArtboards.splice(idx, 1);
                        _artboardToolSelectedAb = null;
                        const lbl = document.getElementById('artboard-sel-name');
                        if (lbl) lbl.textContent = 'None';
                        paper.view.draw();
                        if (window.saveState) saveState();
                    }
                }
            } else {
                deleteSelectedItems();
            }
        }
        
        if (e.ctrlKey || e.metaKey || state.virtualCtrl) {
            if (key === 'z') {
                e.preventDefault();
                undo();
            } else if (key === 'y') {
                e.preventDefault();
                redo();
            } else if (key === 'g') {
                e.preventDefault();
                if (e.shiftKey || state.virtualShift) {
                    ungroupSelectedItems();
                } else {
                    groupSelectedItems();
                }
            } else if (e.key === '=') {
                e.preventDefault();
                setZoomLevel(state.zoomLevel * 1.25);
            } else if (e.key === '-') {
                e.preventDefault();
                setZoomLevel(state.zoomLevel / 1.25);
            } else if (e.key === '0') {
                e.preventDefault();
                fitArtboardToScreen();
            } else if (e.key === ']') {
                if (e.shiftKey || state.virtualShift) {
                    e.preventDefault();
                    bringSelectedToFront();
                }
            } else if (e.key === '[') {
                if (e.shiftKey || state.virtualShift) {
                    e.preventDefault();
                    sendSelectedToBack();
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.code === 'Space') {
            if (state.prevToolBeforeSpace) {
                const prevBtn = document.querySelector(`.tool-btn[data-tool="${state.prevToolBeforeSpace}"]`);
                if (prevBtn) prevBtn.click();
                state.prevToolBeforeSpace = null;
            }
        }
    });
}

// --- Dragging Helper for Floating Keypad Modifiers ---
function makeElementDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e = e || window.event;
        // Don't drag if clicking buttons
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;
        
        const parentWidth = window.innerWidth;
        const parentHeight = window.innerHeight;
        
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + element.offsetWidth > parentWidth) newLeft = parentWidth - element.offsetWidth;
        if (newTop + element.offsetHeight > parentHeight) newTop = parentHeight - element.offsetHeight;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        element.style.bottom = "auto";
    }
    
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}


// =====================================================
// SHAPE BUILDER TOOL RESTORED
// =====================================================

let shapeBuilderPreview = null;

function getShapeBuilderItems() {
    return getSelectedDrawItems().filter(item =>
        item instanceof paper.PathItem
    );
}

function clearShapeBuilderPreview() {
    if (shapeBuilderPreview) {
        shapeBuilderPreview.remove();
        shapeBuilderPreview = null;
    }
}

function handleShapeBuilderMouseDown(event) {
    const items = getShapeBuilderItems();

    if (items.length < 2) {
        alert('Select at least 2 overlapping shapes.');
        return;
    }

    let result = items[0];

    for (let i = 1; i < items.length; i++) {
        try {
            result = event.modifiers.alt
                ? result.subtract(items[i])
                : result.unite(items[i]);
        } catch (err) {
            console.warn(err);
        }
    }

    items.forEach(item => {
        if (item !== result) {
            item.remove();
        }
    });

    result.selected = true;

    saveState();
    updateLayersUI();
    paper.view.draw();
}

function handleShapeBuilderMouseDrag(event) {}

function handleShapeBuilderMouseUp(event) {
    clearShapeBuilderPreview();
}

// =====================================================
// TAPERED BRUSH TOOL (Shift+B)
// Draws variable-width strokes that taper to a point.
// Converts to a filled closed vector Path on release.
// =====================================================
let _tapPath = null;
let _tapPoints = [];

function handleTaperedMouseDown(event) {
    _tapPoints = [event.point];
    _tapPath = new paper.Path({
        strokeColor: state.strokeColor || '#000000',
        strokeWidth: 1,
        strokeCap: 'round',
        strokeJoin: 'round',
        opacity: state.strokeColorNone ? 0 : 1
    });
    _tapPath.add(event.point);
}

function handleTaperedMouseDrag(event) {
    if (!_tapPath) return;
    _tapPath.add(event.point);
    _tapPoints.push(event.point);
    paper.view.draw();
}

function handleTaperedMouseUp(event) {
    if (!_tapPath || _tapPoints.length < 2) {
        if (_tapPath) _tapPath.remove();
        _tapPath = null; _tapPoints = [];
        return;
    }
    _tapPath.smooth({ type: 'catmull-rom' });
    const startWidth = Math.max(1, state.strokeWidth || 6);
    const shape = _buildTaperedShape(_tapPoints, startWidth);
    _tapPath.remove();
    _tapPath = null; _tapPoints = [];
    if (shape) {
        shape.fillColor = state.strokeColor || '#000000';
        shape.strokeColor = null;
        shape.selected = true;
        setupShapeStyles(shape);
        shape.fillColor = state.strokeColor || '#000000'; // re-apply after setupShapeStyles
        shape.strokeColor = null;
        saveState();
        onSelectionChanged();
    }
    paper.view.draw();
}

function _buildTaperedShape(points, startWidth) {
    const n = points.length;
    if (n < 2) return null;
    const half = startWidth / 2;
    const upper = [], lower = [];
    for (let i = 0; i < n; i++) {
        const t    = i / (n - 1);
        const w    = half * (1 - t) + 0.3 * t; // taper to 0.3px
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(n - 1, i + 1)];
        const dir  = next.subtract(prev).normalize();
        const perp = new paper.Point(-dir.y, dir.x);
        upper.push(points[i].add(perp.multiply(w)));
        lower.push(points[i].subtract(perp.multiply(w)));
    }
    const shape = new paper.Path();
    upper.forEach(pt => shape.add(pt));
    lower.reverse().forEach(pt => shape.add(pt));
    shape.closed = true;
    shape.smooth({ type: 'catmull-rom' });
    return shape;
}

// =====================================================
// GRADIENT TOOL (G)
// Select objects first, then drag to set direction.
// A floating panel shows color stops + gradient type.
// =====================================================
let _gradToolOrigin = null;
let _gradToolLine   = null;
let _gradStartDot   = null;
let _gradEndDot     = null;

// Gradient tool state — persists across drags
const _gradState = {
    type: 'linear',     // 'linear' | 'radial'
    c1:   '#ff6b6b',
    c2:   '#4ecdc4',
    opacity1: 1,
    opacity2: 1
};

// Build the floating gradient options panel
function buildGradientToolPanel() {
    if (document.getElementById('grad-tool-panel')) return;
    const p = document.createElement('div');
    p.id = 'grad-tool-panel';
    p.style.cssText = [
        'display:none','position:fixed','bottom:70px','left:50%',
        'transform:translateX(-50%)',
        'background:#2b2b2b','border:1px solid #555','border-radius:8px',
        'padding:10px 14px','z-index:9998',
        'box-shadow:0 4px 24px rgba(0,0,0,.7)',
        'font-family:Inter,sans-serif','font-size:11px','color:#ccc',
        'display:none','align-items:center','gap:12px','white-space:nowrap'
    ].join(';');

    p.innerHTML = [
        // Type toggle
        '<div style="display:flex;gap:4px;">',
            '<button id="gtp-linear" style="padding:4px 10px;border:2px solid #f17c22;border-radius:4px;background:#f17c22;color:#000;font-size:10px;font-weight:700;cursor:pointer;">Linear</button>',
            '<button id="gtp-radial" style="padding:4px 10px;border:2px solid #444;border-radius:4px;background:#1e1e1e;color:#888;font-size:10px;cursor:pointer;">Radial</button>',
        '</div>',
        '<div style="width:1px;height:28px;background:#444;"></div>',
        // Color 1
        '<div style="display:flex;align-items:center;gap:5px;">',
            '<span style="color:#888;font-size:10px;">From</span>',
            '<div id="gtp-sw1" style="width:24px;height:24px;border-radius:3px;border:1px solid #666;background:#ff6b6b;cursor:pointer;" title="Click to change color 1"></div>',
            '<input type="color" id="gtp-c1" value="#ff6b6b" style="display:none;">',
            '<input type="range" id="gtp-a1" min="0" max="100" value="100" style="width:52px;" title="Opacity">',
        '</div>',
        // Arrow
        '<span style="color:#555;font-size:14px;">→</span>',
        // Color 2
        '<div style="display:flex;align-items:center;gap:5px;">',
            '<span style="color:#888;font-size:10px;">To</span>',
            '<div id="gtp-sw2" style="width:24px;height:24px;border-radius:3px;border:1px solid #666;background:#4ecdc4;cursor:pointer;" title="Click to change color 2"></div>',
            '<input type="color" id="gtp-c2" value="#4ecdc4" style="display:none;">',
            '<input type="range" id="gtp-a2" min="0" max="100" value="100" style="width:52px;" title="Opacity">',
        '</div>',
        '<div style="width:1px;height:28px;background:#444;"></div>',
        // Live preview
        '<div id="gtp-prev" style="width:80px;height:24px;border-radius:4px;border:1px solid #555;"></div>',
        '<span style="color:#666;font-size:9px;">Drag on canvas</span>'
    ].join('');
    document.body.appendChild(p);

    // Wire type buttons
    document.getElementById('gtp-linear').onclick = function() {
        _gradState.type = 'linear';
        this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000';
        const rb = document.getElementById('gtp-radial');
        rb.style.background='#1e1e1e'; rb.style.borderColor='#444'; rb.style.color='#888';
        _updateGTPPreview();
    };
    document.getElementById('gtp-radial').onclick = function() {
        _gradState.type = 'radial';
        this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000';
        const lb = document.getElementById('gtp-linear');
        lb.style.background='#1e1e1e'; lb.style.borderColor='#444'; lb.style.color='#888';
        _updateGTPPreview();
    };

    // Wire color pickers
    document.getElementById('gtp-sw1').onclick = () => document.getElementById('gtp-c1').click();
    document.getElementById('gtp-sw2').onclick = () => document.getElementById('gtp-c2').click();

    document.getElementById('gtp-c1').oninput = function() {
        _gradState.c1 = this.value;
        document.getElementById('gtp-sw1').style.background = this.value;
        _updateGTPPreview();
    };
    document.getElementById('gtp-c2').oninput = function() {
        _gradState.c2 = this.value;
        document.getElementById('gtp-sw2').style.background = this.value;
        _updateGTPPreview();
    };
    document.getElementById('gtp-a1').oninput = function() {
        _gradState.opacity1 = parseInt(this.value) / 100;
        _updateGTPPreview();
    };
    document.getElementById('gtp-a2').oninput = function() {
        _gradState.opacity2 = parseInt(this.value) / 100;
        _updateGTPPreview();
    };

    _updateGTPPreview();
}

function _updateGTPPreview() {
    const prev = document.getElementById('gtp-prev');
    if (!prev) return;
    const c1 = _gradState.c1 || '#ff6b6b';
    const c2 = _gradState.c2 || '#4ecdc4';
    if (_gradState.type === 'radial') {
        prev.style.background = `radial-gradient(circle, ${c1}, ${c2})`;
    } else {
        prev.style.background = `linear-gradient(90deg, ${c1}, ${c2})`;
    }
}

function showGradientToolPanel() {
    buildGradientToolPanel();
    const p = document.getElementById('grad-tool-panel');
    if (p) { p.style.display = 'flex'; _updateGTPPreview(); }
}
function hideGradientToolPanel() {
    const p = document.getElementById('grad-tool-panel');
    if (p) p.style.display = 'none';
}
window.showGradientToolPanel = showGradientToolPanel;
window.hideGradientToolPanel = hideGradientToolPanel;

// Safely convert any color value to a Paper.js-safe hex string
function _safeHex(val, fallback) {
    if (!val) return fallback || '#000000';
    // Already a valid 6-digit hex
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
    // 3-digit hex → expand
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        return '#' + val[1]+val[1]+val[2]+val[2]+val[3]+val[3];
    }
    // Try parsing via a canvas
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = val;
        const hex = ctx.fillStyle; // browser normalises to #rrggbb or rgba(...)
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    } catch(_) {}
    return fallback || '#000000';
}

// Build a Paper.js Color with opacity baked in
function _makePaperColor(hex, opacity) {
    const h = _safeHex(hex, '#000000');
    const c = new paper.Color(h);
    c.alpha = (opacity === undefined || isNaN(opacity)) ? 1 : Math.max(0, Math.min(1, opacity));
    return c;
}

function handleGradientToolMouseDown(event) {
    _gradToolOrigin = event.point;
    if (_gradToolLine)  { try { _gradToolLine.remove();  } catch(_){} _gradToolLine  = null; }
    if (_gradStartDot)  { try { _gradStartDot.remove();  } catch(_){} _gradStartDot  = null; }
    if (_gradEndDot)    { try { _gradEndDot.remove();    } catch(_){} _gradEndDot    = null; }

    _gradToolLine = new paper.Path.Line({
        from: event.point, to: event.point,
        strokeColor: new paper.Color('#4a90e2'),
        strokeWidth: 1.5, dashArray: [6, 3]
    });
    _gradToolLine.data = { isGradPreview: true };

    _gradStartDot = new paper.Path.Circle({
        center: event.point, radius: 5,
        fillColor: new paper.Color('#ffffff'),
        strokeColor: new paper.Color('#4a90e2'),
        strokeWidth: 1.5
    });
    _gradStartDot.data = { isGradPreview: true };
}

function handleGradientToolMouseDrag(event) {
    if (!_gradToolOrigin || !_gradToolLine) return;
    _gradToolLine.lastSegment.point = event.point;
    if (_gradEndDot) { try { _gradEndDot.remove(); } catch(_){} }
    _gradEndDot = new paper.Path.Circle({
        center: event.point, radius: 4,
        fillColor: new paper.Color('#4a90e2'),
        strokeColor: new paper.Color('#ffffff'),
        strokeWidth: 1
    });
    _gradEndDot.data = { isGradPreview: true };
    paper.view.draw();
}

function handleGradientToolMouseUp(event) {
    // Remove preview elements
    [_gradToolLine, _gradStartDot, _gradEndDot].forEach(p => {
        if (p) { try { p.remove(); } catch(_){} }
    });
    _gradToolLine = _gradStartDot = _gradEndDot = null;

    const origin = _gradToolOrigin;
    _gradToolOrigin = null;
    if (!origin) return;

    const dest = event.point;
    if (origin.getDistance(dest) < 4) return;

    const isRadial = (_gradState.type === 'radial') ||
                     (event.modifiers && event.modifiers.alt);
    const items = getSelectedDrawItems();
    if (!items.length) {
        showNotification('Select objects first, then drag with the Gradient Tool');
        return;
    }

    // Use colors from the gradient tool panel (validated hex)
    const c1hex = _safeHex(_gradState.c1, '#ff6b6b');
    const c2hex = _safeHex(_gradState.c2, '#4ecdc4');
    const a1    = isNaN(_gradState.opacity1) ? 1 : _gradState.opacity1;
    const a2    = isNaN(_gradState.opacity2) ? 1 : _gradState.opacity2;

    // Build Paper.js color stops with explicit Color objects (avoids hex format errors)
    const stop1 = new paper.Color(c1hex);
    stop1.alpha = a1;
    const stop2 = new paper.Color(c2hex);
    stop2.alpha = a2;

    let applied = 0;
    items.forEach(item => {
        if (!item.bounds) return;
        try {
            if (isRadial) {
                item.fillColor = {
                    gradient: { stops: [stop1, stop2], radial: true },
                    origin:      origin,
                    destination: dest
                };
            } else {
                item.fillColor = {
                    gradient: { stops: [stop1, stop2] },
                    origin:      origin,
                    destination: dest
                };
            }
            applied++;
        } catch(e) { console.warn('Gradient tool err:', e); }
    });

    paper.view.draw();
    saveState();
    if (applied) showNotification((isRadial ? 'Radial' : 'Linear') + ' gradient applied to ' +
        applied + ' object' + (applied > 1 ? 's' : '') + ' ✓');
}

function showNotification(msg, color) {
    const existing = document.getElementById('iguhit-notif');
    if (existing) existing.remove();
    const d = document.createElement('div');
    d.id = 'iguhit-notif';
    d.style.cssText = 'position:fixed;bottom:56px;left:50%;transform:translateX(-50%);' +
        'background:' + (color || '#f17c22') + ';color:#fff;padding:8px 22px;border-radius:6px;font-size:12px;' +
        'font-weight:600;z-index:99999;pointer-events:none;box-shadow:0 2px 14px rgba(0,0,0,.5);' +
        'font-family:Inter,sans-serif;white-space:nowrap;';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2400);
}
window.showNotification = showNotification;



// =====================================================
// DRAG & DROP IMPORT
// =====================================================

document.addEventListener('dragover', function(e) {
    e.preventDefault();
});

document.addEventListener('drop', function(e) {
    e.preventDefault();

    const file = e.dataTransfer.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(evt) {
        const content = evt.target.result;

        if (file.name.endsWith('.svg')) {
            paper.project.importSVG(content, function(item) {
                item.position = paper.view.center;
                saveState();
                paper.view.draw();
            });
        } else if (
            file.name.endsWith('.png') ||
            file.name.endsWith('.jpg') ||
            file.name.endsWith('.jpeg')
        ) {
            const raster = new paper.Raster({
                source: content,
                position: paper.view.center
            });

            raster.onLoad = function() {
                paper.view.draw();
            };
        }
    };

    reader.readAsDataURL(file);

    if (file.name.endsWith('.svg')) {
        reader.readAsText(file);
    }
});



// =====================================================
// MULTI ARTBOARD SYSTEM
// =====================================================

let artboards = [];
window.multiArtboards = artboards;

// createNewArtboard is now an alias — see addNewArtboardProper below
function createNewArtboard() { addNewArtboardProper(); }



// =====================================================
// CREATE CROPMARKS
// =====================================================

function createCropmarks() {
    const items = getSelectedDrawItems();
    if (!items.length) { alert('Select an object first to generate crop marks.'); return; }
    const item   = items[0];
    const bounds = item.bounds;

    // Adobe Illustrator cropmark spec:
    //   - 0.25pt stroke, pure black (Registration/All-Plates)
    //   - 8.5pt gap from object edge
    //   - 14pt mark length
    const gap = 8.5;
    const len = 14;
    const sw  = 0.72; // 0.25pt @ 72dpi
    const L = bounds.left,  R = bounds.right;
    const T = bounds.top,   B = bounds.bottom;

    function mkLine(fx, fy, tx, ty) {
        return new paper.Path.Line({
            from: [fx, fy], to: [tx, ty],
            strokeColor: new paper.Color(0, 0, 0),
            strokeWidth: sw,
            fillColor: null
        });
    }

    // Activate the current draw layer so cropmarks go into it (not artboard layer)
    if (window.drawLayer) drawLayer.activate();

    const grp = new paper.Group([
        // Top-left corner: horizontal + vertical
        mkLine(L - gap - len, T,       L - gap,       T),
        mkLine(L,             T - gap - len, L,        T - gap),
        // Top-right corner
        mkLine(R + gap,       T,       R + gap + len,  T),
        mkLine(R,             T - gap - len, R,         T - gap),
        // Bottom-left corner
        mkLine(L - gap - len, B,       L - gap,        B),
        mkLine(L,             B + gap, L,              B + gap + len),
        // Bottom-right corner
        mkLine(R + gap,       B,       R + gap + len,  B),
        mkLine(R,             B + gap, R,              B + gap + len)
    ]);

    grp.name = 'Crop Marks';
    grp.data = { isCropMarkGroup: true };
    grp.selected = true;

    saveState();
    updateLayersUI();
    paper.view.draw();
}

document.getElementById('btn-create-cropmarks')?.addEventListener('click', createCropmarks);



// =====================================================
// TRUE MULTI ARTBOARD SYSTEM
// =====================================================

window.multiArtboards = [];

function createArtboardObject(x, y, width, height) {

    const group = new paper.Group();

    const shadow = new paper.Path.Rectangle({
        point: [x + 4, y + 4],
        size: [width, height],
        fillColor: '#111',
        opacity: 0.25
    });

    const rect = new paper.Path.Rectangle({
        point: [x, y],
        size: [width, height],
        fillColor: '#ffffff',
        strokeColor: '#666',
        strokeWidth: 1
    });

    const grid = new paper.Group();

    const spacing = 50;

    for (let gx = x + spacing; gx < x + width; gx += spacing) {
        grid.addChild(new paper.Path.Line({
            from: [gx, y],
            to: [gx, y + height],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        }));
    }

    for (let gy = y + spacing; gy < y + height; gy += spacing) {
        grid.addChild(new paper.Path.Line({
            from: [x, gy],
            to: [x + width, gy],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        }));
    }

    group.addChild(shadow);
    group.addChild(rect);
    group.addChild(grid);

    group.locked = true;
    group.guide = true;
    group.data.isArtboard = true;

    return {
        group,
        rect,
        shadow,
        grid
    };
}

function addNewArtboardProper() {
    artboardLayer.locked = false;
    artboardLayer.activate();

    function restoreDrawLayer() {
        artboardLayer.locked = true;
        const dl = window.drawLayer || paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
        if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }
    }

    // ── 2-column layout ──────────────────────────────────────────────
    // Column 0 = main artboard (already at x=200, y=150)
    // Column 1 = to the right of main artboard
    // Row increases every 2 artboards (every 2 secondary entries)
    //
    // Layout (index = secondary artboard count before this one):
    //   index 0 → col 1, row 0  (right of main)
    //   index 1 → col 0, row 1  (below main)
    //   index 2 → col 1, row 1  (below index 0)
    //   index 3 → col 0, row 2  ...etc
    //
    // Main artboard origin: (200, 150)
    const SPACING_X = 80;   // horizontal gap between artboards
    const SPACING_Y = 100;  // vertical gap between artboard rows
    const AW = state.artboardWidth;
    const AH = state.artboardHeight;
    const ORIGIN_X = 200;
    const ORIGIN_Y = 150;

    const extraCount = window.multiArtboards.filter(a => !a.isMain).length;

    // Map secondary index to (col, row) in 2-column grid
    // Secondary 0 → (1,0), 1 → (0,1), 2 → (1,1), 3 → (0,2), 4 → (1,2)...
    let col, row;
    if (extraCount === 0) {
        col = 1; row = 0; // first new artboard goes right of main
    } else {
        // After the first secondary, fill pairs: (0,row) then (1,row)
        // secondary 1 → col=0,row=1; secondary 2 → col=1,row=1; etc.
        const pairIndex = extraCount; // 1-based: 1=(0,1), 2=(1,1), 3=(0,2)...
        row = Math.ceil(pairIndex / 2);
        col = (pairIndex % 2 === 1) ? 0 : 1;
    }

    const x = ORIGIN_X + col * (AW + SPACING_X);
    const y = ORIGIN_Y + row * (AH + SPACING_Y);

    const artboard = createArtboardObject(x, y, AW, AH);
    artboard.bounds = artboard.rect.bounds;
    window.multiArtboards.push(artboard);

    restoreDrawLayer();
    paper.project.deselectAll();
    paper.view.draw();
    autoSaveProject();
}

const artboardBtn = document.getElementById('btn-new-artboard');

if (artboardBtn) {
    artboardBtn.onclick = addNewArtboardProper;
}


// =====================================================
// EXPORT MULTI ARTBOARD PDF — Pure-JS Raw Vector PDF
// Writes real PDF path operators (m l c h S f etc.)
// directly from Paper.js path data. No external library
// beyond jsPDF for the file wrapper. Opens in Illustrator
// as fully editable vector objects.
// =====================================================

function exportAllArtboardsPDF() {
    // ── Collect artboards ──────────────────────────────
    const boards = [];

    // Always find the main artboard fresh from the layer to avoid stale references
    const mainRect = window.artboardRect && window.artboardRect.isInserted()
        ? window.artboardRect
        : (window.artboardLayer
            ? window.artboardLayer.children['artboardRect'] || 
              window.artboardLayer.children.find?.(c => c.name === 'artboardRect')
            : null);

    if (mainRect && mainRect.isInserted()) {
        boards.push({ rect: mainRect, name: 'Artboard 1' });
    }
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        window.multiArtboards.forEach((ab, i) => {
            if (ab.isMain) return; // skip isMain alias — main artboard already added above
            if (ab.rect && ab.rect.isInserted())
                boards.push({ rect: ab.rect, name: 'Artboard ' + (i + 2) });
        });
    }
    if (!boards.length) { alert('No artboard found. Please check your artboard is visible.'); return; }

    // ── Colour helpers ─────────────────────────────────
    function paperColorToRGB(c) {
        if (!c) return null;
        // Gradient colour — cannot convert directly
        if (c.type === 'gradient' || (c.gradient)) return null;
        try {
            const rgb = c.convert('rgb');
            return [
                Math.max(0, Math.min(1, rgb.red   || 0)),
                Math.max(0, Math.min(1, rgb.green  || 0)),
                Math.max(0, Math.min(1, rgb.blue   || 0))
            ];
        } catch (_) { return null; }
    }

    // Resolve any Paper.js Color to an RGB triple safely
    function safeRGB(c, fallback) {
        const r = paperColorToRGB(c);
        return r || (fallback || [0, 0, 0]);
    }

    function r3(n) { return +n.toFixed(4); }
    function tx(px, ox) { return r3(px - ox); }
    function ty(py, oy, ph) { return r3(ph - (py - oy)); }

    // Check if a Paper.js Color is a gradient
    function isGradient(c) {
        return c && (c.type === 'gradient' || c.gradient != null);
    }

    // Extract gradient stops as [[r,g,b], offset] pairs
    function getGradientStops(c) {
        if (!c || !c.gradient || !c.gradient.stops) return [[0,0,0],[1,1,1]];
        return c.gradient.stops.map(stop => {
            let color, offset;
            if (Array.isArray(stop)) {
                color  = stop[0];
                offset = stop[1] != null ? stop[1] : 0;
            } else if (stop && stop.color !== undefined) {
                color  = stop.color;
                offset = stop.offset != null ? stop.offset : 0;
            } else {
                color  = stop;
                offset = 0;
            }
            let rgb = [0, 0, 0];
            try {
                if (typeof color === 'string') {
                    const pc = new paper.Color(color);
                    rgb = [pc.red || 0, pc.green || 0, pc.blue || 0];
                } else if (color && typeof color === 'object') {
                    const pc = color.convert ? color.convert('rgb') : color;
                    rgb = [pc.red || 0, pc.green || 0, pc.blue || 0];
                }
            } catch(_) {}
            return { rgb, offset: +offset };
        });
    }

    // ── PDF SHading (gradient) support ─────────────────
    // We collect shading dicts and XObjects per page, then embed them.
    let shadingCounter = 0;
    const pageShading = []; // per-board: { dicts: {}, ops: [] }

    // Build a PDF Shading dict string and return a /SH name
    function buildShading(fillColor, item, ox, oy, ph, shadings) {
        if (!isGradient(fillColor)) return null;
        const isRadial = fillColor.gradient && fillColor.gradient.radial;
        const stops    = getGradientStops(fillColor);
        if (!stops || stops.length < 2) return null;

        // Get origin and destination in PDF coords
        let x0, y0, x1, y1;
        try {
            x0 = tx(fillColor.origin.x,      ox);
            y0 = ty(fillColor.origin.y,      oy, ph);
            x1 = tx(fillColor.destination.x, ox);
            y1 = ty(fillColor.destination.y, oy, ph);
        } catch(_) {
            // Fall back to item bounding box
            const b = item.bounds;
            x0 = tx(b.x,           ox); y0 = ty(b.y + b.height, oy, ph);
            x1 = tx(b.x + b.width, ox); y1 = ty(b.y,            oy, ph);
        }

        const shName = `SH${++shadingCounter}`;

        // Build a Function type 3 (stitching) or type 2 (single interval)
        // For simplicity we use type 2 between first and last stop
        const c0 = stops[0].rgb.map(r3).join(' ');
        const c1 = stops[stops.length - 1].rgb.map(r3).join(' ');

        let dictStr;
        if (isRadial) {
            const r = Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
            dictStr = [
                `<< /ShadingType 3`,
                `/ColorSpace /DeviceRGB`,
                `/Coords [${r3(x0)} ${r3(y0)} 0 ${r3(x0)} ${r3(y0)} ${r3(r)}]`,
                `/Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >>`,
                `/Extend [true true]`,
                `>>`
            ].join('\n');
        } else {
            dictStr = [
                `<< /ShadingType 2`,
                `/ColorSpace /DeviceRGB`,
                `/Coords [${r3(x0)} ${r3(y0)} ${r3(x1)} ${r3(y1)}]`,
                `/Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >>`,
                `/Extend [true true]`,
                `>>`
            ].join('\n');
        }

        shadings[shName] = dictStr;
        return shName;
    }

    // ── PDF coordinate transform ───────────────────────
    // ── Convert one Paper.js item to PDF content stream ops ──
    function itemToOps(item, ox, oy, ph, shadings) {
        const ops = [];

        if (!item.visible || item.opacity === 0) return ops;

        const opacity = item.opacity != null ? item.opacity : 1;
        if (opacity < 1) ops.push(`q\n/GS${Math.round(opacity * 100)} gs`);

        if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
            const paths = item instanceof paper.CompoundPath
                ? item.children : [item];

            // Build path data
            let pd = '';
            for (const path of paths) {
                if (!path.segments || !path.segments.length) continue;
                const segs = path.segments;
                const fp = segs[0].point;
                pd += `${tx(fp.x, ox)} ${ty(fp.y, oy, ph)} m\n`;

                for (let s = 1; s < segs.length; s++) {
                    const prev = segs[s - 1];
                    const curr = segs[s];
                    const ho   = prev.handleOut;
                    const hi   = curr.handleIn;
                    if ((ho && (ho.x !== 0 || ho.y !== 0)) ||
                        (hi && (hi.x !== 0 || hi.y !== 0))) {
                        const c1x = tx(prev.point.x + (ho ? ho.x : 0), ox);
                        const c1y = ty(prev.point.y + (ho ? ho.y : 0), oy, ph);
                        const c2x = tx(curr.point.x + (hi ? hi.x : 0), ox);
                        const c2y = ty(curr.point.y + (hi ? hi.y : 0), oy, ph);
                        const ex  = tx(curr.point.x, ox);
                        const ey  = ty(curr.point.y, oy, ph);
                        pd += `${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} c\n`;
                    } else {
                        pd += `${tx(curr.point.x, ox)} ${ty(curr.point.y, oy, ph)} l\n`;
                    }
                }

                if (path.closed && segs.length > 1) {
                    const last   = segs[segs.length - 1];
                    const first2 = segs[0];
                    const ho = last.handleOut;
                    const hi = first2.handleIn;
                    if ((ho && (ho.x !== 0 || ho.y !== 0)) ||
                        (hi && (hi.x !== 0 || hi.y !== 0))) {
                        const c1x = tx(last.point.x + (ho ? ho.x : 0), ox);
                        const c1y = ty(last.point.y + (ho ? ho.y : 0), oy, ph);
                        const c2x = tx(first2.point.x + (hi ? hi.x : 0), ox);
                        const c2y = ty(first2.point.y + (hi ? hi.y : 0), oy, ph);
                        const ex  = tx(first2.point.x, ox);
                        const ey  = ty(first2.point.y, oy, ph);
                        pd += `${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} c\n`;
                    }
                    pd += 'h\n';
                }
            }

            if (!pd.trim()) { if (opacity < 1) ops.push('Q'); return ops; }

            const hasFillGrad   = isGradient(item.fillColor);
            const fill          = hasFillGrad ? null : paperColorToRGB(item.fillColor);
            const stroke        = paperColorToRGB(item.strokeColor);
            const sw            = item.strokeWidth || 0;

            if (hasFillGrad) {
                // Render gradient fill via PDF shading:
                // 1. Clip to path, 2. Paint shading, 3. Restore
                const shName = buildShading(item.fillColor, item, ox, oy, ph, shadings);
                if (shName) {
                    ops.push('q');            // save
                    ops.push(pd.trim());      // path
                    ops.push('W n');          // clip to path, no fill
                    ops.push(`/${shName} sh`);// paint shading
                    ops.push('Q');            // restore
                }
                // Now draw stroke if any
                if (stroke && sw > 0) {
                    ops.push(pd.trim());
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('S');
                }
            } else {
                ops.push(pd.trim());
                if (fill && stroke && sw > 0) {
                    ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('B');
                } else if (fill) {
                    ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
                    ops.push('f');
                } else if (stroke && sw > 0) {
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('S');
                } else {
                    ops.push('n');
                }
            }

        } else if (item instanceof paper.PointText) {
            const fill = safeRGB(item.fillColor, [0,0,0]);
            const fs   = item.fontSize || 12;
            const x    = tx(item.point.x, ox);
            const y    = ty(item.point.y, oy, ph);
            const safe = (item.content || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
            ops.push('BT');
            ops.push(`/F1 ${r3(fs)} Tf`);
            ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
            ops.push(`${x} ${y} Td`);
            ops.push(`(${safe}) Tj`);
            ops.push('ET');

        } else if (item instanceof paper.Group) {
            ops.push('q');
            item.children.forEach(child => {
                ops.push(...itemToOps(child, ox, oy, ph, shadings));
            });
            ops.push('Q');
        }

        if (opacity < 1) ops.push('Q');
        return ops;
    }

    // ── Build raw PDF bytes ────────────────────────────
    // We write a minimal but spec-compliant PDF manually.
    // Structure: header, objects (pages, content streams), xref, trailer.

    const pdfParts = []; // array of strings/Uint8Arrays
    let offset = 0;
    const offsets = [];

    function w(str) {
        pdfParts.push(str);
        offset += str.length;
    }

    // Write header
    w('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); // magic bytes signal binary content

    // Object counter (1-based)
    let objNum = 0;
    function nextObj() { return ++objNum; }

    const catNum   = nextObj(); // 1 - catalog
    const pagesNum = nextObj(); // 2 - pages dict
    const fontNum  = nextObj(); // 3 - font (Helvetica)

    // We'll fill page object numbers after we know how many pages
    const pageNums = boards.map(() => nextObj());

    // Content stream object numbers
    const contentNums = boards.map(() => nextObj());

    // Write font object
    function writeObj(num, content) {
        offsets[num] = offset;
        w(`${num} 0 obj\n${content}\nendobj\n`);
    }

    // ── PPI → PDF points conversion ───────────────────
    // PDF uses points (1/72 inch). Our artboard is in paper-pixels at state.artboardResolution ppi.
    // Scale factor: 72 / PPI converts paper-pixels → PDF points.
    const PDF_PPI  = state.artboardResolution || 300;
    const PX_TO_PT = 72 / PDF_PPI; // e.g. 72/300 = 0.24 pt per pixel

    // ── Per-page content streams ──────────────────────
    // Each page gets its own shadings dict so shading names don't conflict
    const contentStreams = [];
    const pageShadeObjs = []; // array of {name: dictStr} per page

    for (let i = 0; i < boards.length; i++) {
        const bounds = boards[i].rect.bounds;
        const W = bounds.width, H = bounds.height;
        const ox = bounds.x,    oy = bounds.y;

        // Per-page shadings dict — populated by itemToOps via buildShading
        const shadings = {};

        const ops = [];
        // Scale all subsequent coordinates from paper-pixels to PDF points.
        // This single cm transform handles everything: paths, text, shadings.
        ops.push(`${r3(PX_TO_PT)} 0 0 ${r3(PX_TO_PT)} 0 0 cm`);

        // White page background (in paper-pixel coords — will be scaled by cm)
        ops.push('q');
        ops.push('1 1 1 rg');
        ops.push(`0 0 ${r3(W)} ${r3(H)} re`);
        ops.push('f');
        ops.push('Q');

        // Draw all items from draw layers
        paper.project.layers.forEach(layer => {
            if (layer === window.artboardLayer) return;
            if (layer.name === 'System Artboard') return;
            layer.children.forEach(child => {
                if (!child.isInserted() || !child.visible) return;
                if (child.bounds && child.bounds.intersects(bounds)) {
                    ops.push('q');
                    ops.push(...itemToOps(child, ox, oy, H, shadings));
                    ops.push('Q');
                }
            });
        });

        contentStreams.push(ops.join('\n'));
        pageShadeObjs.push(shadings);
    }

    // ── Write objects ─────────────────────────────────

    // Catalog
    writeObj(catNum,
        `<< /Type /Catalog\n   /Pages ${pagesNum} 0 R\n>>`
    );

    // Pages (parent)
    const kidsStr = pageNums.map(n => `${n} 0 R`).join(' ');
    writeObj(pagesNum,
        `<< /Type /Pages\n   /Kids [${kidsStr}]\n   /Count ${boards.length}\n>>`
    );

    // Font (Helvetica — standard PDF font, always available)
    writeObj(fontNum,
        `<< /Type /Font\n   /Subtype /Type1\n   /BaseFont /Helvetica\n   /Encoding /WinAnsiEncoding\n>>`
    );

    // Write each page + its content stream
    for (let i = 0; i < boards.length; i++) {
        const bounds = boards[i].rect.bounds;
        // MediaBox must be in PDF points: paper-pixels × (72/PPI)
        const W_pt = r3(bounds.width  * PX_TO_PT);
        const H_pt = r3(bounds.height * PX_TO_PT);
        const cNum = contentNums[i];
        const pNum = pageNums[i];
        const stream = contentStreams[i];
        const shadings = pageShadeObjs[i];

        // Build Shading resource dict if this page has gradients
        const shadeKeys = Object.keys(shadings);
        let shadeResource = '';
        if (shadeKeys.length > 0) {
            const shEntries = shadeKeys.map(k => `/${k} ${shadings[k]}`).join('\n');
            shadeResource = `\n   /Shading << ${shEntries} >>`;
        }

        // Page object — MediaBox in PDF points (8.5×11in = 612×792pt)
        writeObj(pNum,
            `<< /Type /Page\n   /Parent ${pagesNum} 0 R\n` +
            `   /MediaBox [0 0 ${W_pt} ${H_pt}]\n` +
            `   /Contents ${cNum} 0 R\n` +
            `   /Resources << /Font << /F1 ${fontNum} 0 R >>${shadeResource} >>\n>>`
        );

        // Content stream object
        const streamBytes = new TextEncoder().encode(stream);
        const slen = streamBytes.length;
        offsets[cNum] = offset;
        w(`${cNum} 0 obj\n<< /Length ${slen} >>\nstream\n`);
        w(stream);
        w('\nendstream\nendobj\n');
    }

    // ── Cross-reference table ─────────────────────────
    const xrefOffset = offset;
    const totalObjs = objNum + 1; // +1 for object 0

    let xref = `xref\n0 ${totalObjs}\n`;
    xref += `0000000000 65535 f \n`; // object 0 (free)
    for (let n = 1; n <= objNum; n++) {
        const off = offsets[n] || 0;
        xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    w(xref);

    // ── Trailer ───────────────────────────────────────
    w(`trailer\n<< /Size ${totalObjs}\n   /Root ${catNum} 0 R\n>>\n`);
    w(`startxref\n${xrefOffset}\n%%EOF\n`);

    // ── Assemble and download ─────────────────────────
    const fullPDF = pdfParts.join('');
    const bytes   = new Uint8Array(fullPDF.length);
    for (let i = 0; i < fullPDF.length; i++) bytes[i] = fullPDF.charCodeAt(i) & 0xff;

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href: url, download: 'iGuhit-export.pdf'
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// High-res raster fallback (kept for reference, not used by main export)
async function addHighResImagePage(pdf, bounds) {
    const W = Math.round(bounds.width);
    const H = Math.round(bounds.height);
    const DPR = 4;
    const abVis = window.artboardLayer?.visible ?? true;
    if (window.artboardLayer) window.artboardLayer.visible = false;
    paper.view.draw();
    const zoom = paper.view.zoom, deviceDPR = window.devicePixelRatio || 1;
    const vp = paper.view.projectToView(bounds.topLeft);
    const tc = document.createElement('canvas');
    tc.width = W * DPR; tc.height = H * DPR;
    const ctx = tc.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tc.width, tc.height);
    ctx.scale(DPR, DPR);
    ctx.drawImage(paper.view.element,
        Math.round(vp.x * deviceDPR), Math.round(vp.y * deviceDPR),
        Math.round(bounds.width * zoom * deviceDPR), Math.round(bounds.height * zoom * deviceDPR),
        0, 0, W, H);
    pdf.addImage(tc.toDataURL('image/png', 1.0), 'PNG', 0, 0,
        bounds.width, bounds.height, undefined, 'FAST');
    if (window.artboardLayer) window.artboardLayer.visible = abVis;
    paper.view.draw();
}

// Single authoritative PDF export — iguhit-enhancements.js btn-export-pdf listener is disabled
document.getElementById('btn-export-pdf')?.addEventListener('click', exportAllArtboardsPDF);

// Wire File-menu buttons that delegate to iguhit-features.js
document.getElementById('btn-export-png-artboards')?.addEventListener('click', () => {
    if (window.exportPNGPerArtboard) window.exportPNGPerArtboard();
});
document.getElementById('btn-embed-image-menu')?.addEventListener('click', () => {
    if (window.openImageEmbed) window.openImageEmbed();
});


// =====================================================
// STROKE STYLE PANEL
// =====================================================

function applyStrokeProperties() {
    const items = getSelectedDrawItems();
    const style      = document.getElementById('stroke-style')?.value;
    const startArrow = document.getElementById('stroke-arrow-start')?.value || 'none';
    const endArrow   = document.getElementById('stroke-arrow-end')?.value   || 'none';

    items.forEach(item => {
        if (!(item instanceof paper.Path)) return;

        if (style === 'dashed') {
            item.dashArray = [10, 6];
        } else {
            item.dashArray = [];
        }

        if (!item.data) item.data = {};
        item.data.arrowStart = startArrow;
        item.data.arrowEnd   = endArrow;
    });

    saveState();
    autoSaveProject();

    // Trigger arrowhead redraw in enhancements
    if (window.redrawAllArrows) {
        setTimeout(window.redrawAllArrows, 20);
    }
    paper.view.draw();
}

document.getElementById('stroke-style')?.addEventListener(
    'change',
    applyStrokeProperties
);

document.getElementById('stroke-arrow-start')?.addEventListener(
    'change',
    applyStrokeProperties
);

document.getElementById('stroke-arrow-end')?.addEventListener(
    'change',
    applyStrokeProperties
);


// =====================================================
// AUTOSAVE
// =====================================================

function autoSaveProject() {
    try {
        localStorage.setItem(
            'iguhit-project-autosave',
            paper.project.exportJSON({ asString: true })
        );
    } catch (e) {
        console.warn(e);
    }
}

function restoreAutoSavedProject() {
    try {

        const saved = localStorage.getItem(
            'iguhit-project-autosave'
        );

        if (saved) {
            paper.project.importJSON(saved);
        }

    } catch (e) {
        console.warn(e);
    }
}

setInterval(autoSaveProject, 10000);

window.addEventListener('beforeunload', autoSaveProject);

