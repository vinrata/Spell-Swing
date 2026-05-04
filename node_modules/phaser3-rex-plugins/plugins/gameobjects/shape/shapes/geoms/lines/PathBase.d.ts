import BaseGeom from '../base/BaseGeom';
import type {
    DashPatternConfig as StrokeDashPatternConfig,
    DashPatternType as StrokeDashPatternType,
    IStrokePathMethods,
    IStrokePathState,
} from '../../../utils/strokepath/StrokePathMethods';

export default PathBase;

declare namespace PathBase {
    /**
     * Auto dash pattern configuration.
     */
    type DashPatternConfig = StrokeDashPatternConfig;

    /**
     * Dash pattern definition.
     */
    type DashPatternType = StrokeDashPatternType;
}

/**
 * Base class for path-based geometries.
 */
declare class PathBase extends BaseGeom {
    /**
     * True if the path should be closed.
     */
    closePath: boolean;
}

interface PathBase extends IStrokePathMethods, IStrokePathState {
}
