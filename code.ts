type BaseTypeNode = (BaseNodeMixin & { type: NodeType });

type BaseParentNode = (BaseTypeNode & DefaultContainerMixin) | null;

type PropsType = FrameMixin & LayoutMixin & BlendMixin & ConstraintMixin & ExportMixin;

const isSymbol = (node:BaseTypeNode) => node.type == "COMPONENT" || node.type == "INSTANCE";
const isContainer = (node:BaseTypeNode) => node.type == "GROUP" || node.type == "FRAME";

const sortByDepth = (a, b) => a.parent.children.indexOf(a) - b.parent.children.indexOf(b);

function getValidParent(parent:BaseParentNode, parents:BaseParentNode[] = []):BaseParentNode {
	if (parent.type == "PAGE" && parents.length == 0) {
		return parent;
	} else if (parent.type != "DOCUMENT") {
		parents.unshift(parent);
		return getValidParent(parent.parent as BaseParentNode, parents);
	} else {
		for (const parent of parents) if (isSymbol(parent)) return parent;
		return parents[parents.length - 1];
	}
}

function moveComponents(node: BaseParentNode, moved: ComponentNode[] = []) {
	node.children.forEach((child) => {
		switch (child.type) {
			case "COMPONENT": {
				const component = child as ComponentNode;
				console.log('>>> ' + component.name);
				const instance = component.createInstance();
				instance.x = component.x;
				instance.y = component.y;
				node.insertChild(node.children.indexOf(component), instance);
				moved.push(component);
				break;
			}
			case "FRAME":
			case "GROUP": {
				moveComponents(child, moved);
				break;
			}
			default:
		}
	});
}

function copyProps(component: ComponentNode, from: PropsType, isFrame = false) {

	if (isFrame) {
		component.layoutGrids = from.layoutGrids;
		component.gridStyleId = from.gridStyleId;
		component.clipsContent = from.clipsContent;
		component.guides = from.guides;
	}

	component.opacity = from.opacity;
	component.blendMode = from.blendMode;
	component.isMask = from.isMask;
	component.effects = from.effects;
	component.effectStyleId = from.effectStyleId;
	component.constraints = from.constraints;
	component.exportSettings = from.exportSettings;
	component.rotation = from.rotation;

	if (from.backgrounds) {
		component.backgrounds = from.backgrounds;
		component.backgroundStyleId = from.backgroundStyleId;
	}
}

const selection = figma.currentPage.selection;

let note = null;

let select = [];

if (selection.length > 0) {

	let groups:Map<String, SceneNode[]> = new Map();

	selection.forEach(node => {
		const pn = node.parent.id;
		let sets = groups.has(pn) ? groups.get(pn) : groups.set(pn, []).get(pn);
		sets.push(node);
	});

	groups.forEach(nodes => {

		let indexShift = nodes.length;

		nodes.sort(sortByDepth);

		let first = nodes[0];
		let last = nodes[nodes.length - 1];

		const parent = first.parent;

		let index = parent.children.indexOf(last) + 1;

		let validParent = getValidParent(parent as BaseParentNode);

		const moved:ComponentNode[] = [];
		nodes.forEach(node => {
			if (isContainer(node)) moveComponents(node as BaseParentNode, moved);
		});

		nodes.sort(sortByDepth);

		let instanced = false;

		nodes = nodes.map(node => {
			if (node.type == "COMPONENT") {
				const instance = node.createInstance();
				instance.x = node.x;
				instance.y = node.y;
				instanced = true;
				indexShift--;
				return instance;
			}
			return node;
		});

		first = nodes[0];
		last = nodes[nodes.length - 1];

		const name = last.name;

		let nx = first.x;
		let ny = first.y;
		nodes.forEach(n => {
			nx = Math.min(nx, n.x);
			ny = Math.min(ny, n.y);
		});

		const container = nodes.length == 1 && isContainer(first);
		let group:FrameNode = container ? (first as FrameNode) : figma.group(nodes, parent);

		let component = figma.createComponent();
		component.x = nx;
		component.y = ny;
		component.resize(group.width, group.height);

		const isFrame = group.type == "FRAME";

		if (container) {
			copyProps(component, group, isFrame);
		} else if (nodes.length == 1) {
			copyProps(component, first as PropsType);
		}

		const gx = group.x;
		const gy = group.y;

		const mx = component.x + component.width + 64;
		let my = component.y;

		moved.forEach((m) => {
			validParent.appendChild(m);
			m.x = mx;
			m.y = my;
			my += m.height + 64;
		});

		group.children.forEach(node => {
			if (!isFrame) {
				node.x -= gx;
				node.y -= gy;
			}
			component.appendChild(node);
		});

		if (isFrame) group.remove();

		component.name = name;

		/*const near = parent.type != "COMPONENT" ? null : validParent;

		if (near != null) {
			const instance = component.createInstance();
			instance.x = component.x;
			instance.y = component.y;
			parent.insertChild(index, instance);
			component.x = near.x + near.width + 34;
			component.y = near.y;
			index = parent.children.indexOf(near as SceneNode) + 1;
		}*/

		if (isSymbol(validParent)) {
			validParent = validParent.parent as BaseParentNode;
		}

		validParent.insertChild(index - indexShift, component);
		select.push(component);
	});
}

if (note) figma.notify(note);

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();