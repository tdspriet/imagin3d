import { NodeResizer } from 'reactflow'
import NodeLayerControls from './NodeLayerControls'
import WeightOverlay from './WeightOverlay'
import './ColorPaletteNode.css'

function ColorPaletteNode({ id, data, selected }) {
  const colors = data?.colors ?? []

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={50}
        minHeight={50}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
      />
      <div className="node-frame palette-node-frame">
        <NodeLayerControls id={id} isVisible={selected} />
        <div className="palette-node">
          <div className="palette-node__stripes">
            {colors.map((color, index) => (
              <div
                key={`${id}-stripe-${index}`}
                className="palette-node__stripe"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <WeightOverlay weight={data.weight} reasoning={data.reasoning} />
        </div>
      </div>
    </>
  )
}

export default ColorPaletteNode
