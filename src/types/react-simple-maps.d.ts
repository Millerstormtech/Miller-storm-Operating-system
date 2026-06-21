declare module "react-simple-maps" {
  import { ComponentType, SVGProps } from "react";

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, any>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: any[] }) => React.ReactNode;
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: any;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<any>;
  export const Line: ComponentType<any>;
  export const Sphere: ComponentType<any>;
  export const Graticule: ComponentType<any>;
  export const ZoomableGroup: ComponentType<any>;
}
