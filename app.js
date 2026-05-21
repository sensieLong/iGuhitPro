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
    
    // Artboard dimensions
    artboardWidth: 800,
    artboardHeight: 600,
    artboardUnit: 'px',
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
    
    // Core mouse events delegation
    currentPaperTool.onMouseDown = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        // Non-drawing tools (Hand, Zoom) work even when the active layer is locked
        if (tool !== 'hand' && tool !== 'zoom') {
            if (paper.project.activeLayer.locked) {
                alert("The active layer is locked! Please unlock it or select another layer to draw.");
                return;
            }
        }
        
        if (tool === 'select') {
            handleSelectMouseDown(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDown(event);
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
        }
    };
    
    currentPaperTool.onMouseDrag = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseDrag(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDrag(event);
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
        }
    };
    
    currentPaperTool.onMouseUp = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseUp(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseUp(event);
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
    const textVal = prompt("Enter text:", "iGuhit Vector");
    if (textVal) {
        const textItem = new paper.PointText({
            point: event.point,
            content: textVal,
            fontSize: 24,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: '600'
        });
        setupShapeStyles(textItem);
        textItem.selected = true;
        
        saveState();
        onSelectionChanged();
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
function handleEraserMouseDown(event) {
    activePath = new paper.Path({
        strokeColor: '#777777',
        strokeWidth: 20,
        strokeCap: 'round',
        opacity: 0.5
    });
    activePath.add(event.point);
}

function handleEraserMouseDrag(event) {
    if (activePath) {
        activePath.add(event.point);
    }
}

function handleEraserMouseUp(event) {
    if (activePath) {
        const eraserStroke = activePath;
        eraserStroke.remove();
        activePath = null;
        
        const drawItems = [...paper.project.activeLayer.children];
        let changed = false;
        
        drawItems.forEach(item => {
            if (item.layer.name === 'System Artboard') return;
            
            if (item.bounds.intersects(eraserStroke.bounds)) {
                if (item instanceof paper.Path && (item.closed || item.fillColor)) {
                    try {
                        const pathOutline = item.subtract(eraserStroke);
                        if (pathOutline && pathOutline.area !== item.area) {
                            item.replaceWith(pathOutline);
                            pathOutline.selected = true;
                            changed = true;
                        }
                    } catch(err) {
                        if (item.contains(eraserStroke.position)) {
                            item.remove();
                            changed = true;
                        }
                    }
                } else if (item instanceof paper.Path) {
                    const intersections = item.getIntersections(eraserStroke);
                    if (intersections.length > 0) {
                        item.remove();
                        changed = true;
                    }
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
        
        artboardLayer.locked = true;
        
        if (drawLayer) drawLayer.activate();
        
        paper.view.draw();
        saveState();
    }
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
    if (item.dashArray) {
        document.getElementById('prop-dash-array').value = item.dashArray.join(', ');
    } else {
        document.getElementById('prop-dash-array').value = '';
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
        applyStylesToSelection();
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
        if (isNaN(val) || val <= 0) {
            syncArtboardInputs();
            return;
        }
        const newWPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        if (newWPixels !== state.artboardWidth) {
            updateArtboardSize(newWPixels, state.artboardHeight);
        }
    };

    document.getElementById('artboard-w-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseFloat(e.target.value);
            handleArtboardWChange(val);
            e.target.blur();
        }
    });
    document.getElementById('artboard-w-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        handleArtboardWChange(val);
    });

    const handleArtboardHChange = (val) => {
        if (isNaN(val) || val <= 0) {
            syncArtboardInputs();
            return;
        }
        const newHPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        if (newHPixels !== state.artboardHeight) {
            updateArtboardSize(state.artboardWidth, newHPixels);
        }
    };

    document.getElementById('artboard-h-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseFloat(e.target.value);
            handleArtboardHChange(val);
            e.target.blur();
        }
    });
    document.getElementById('artboard-h-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        handleArtboardHChange(val);
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
    
    // If only one item is selected, we MUST align relative to the Artboard
    if (selection.length === 1 || alignTo === 'artboard') {
        if (artboardRect) {
            bounds = artboardRect.bounds.clone();
        } else {
            bounds = paper.view.bounds.clone();
        }
        
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
        } else if (key === 'a') {
            document.getElementById('tool-direct-select').click();
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
            deleteSelectedItems();
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
