import { Request, Response, NextFunction } from "express";
import type { Instance } from "../types/quicknode";
declare global {
    namespace Express {
        interface Request {
            instance?: Instance;
        }
    }
}
export declare function instanceLookup(req: Request, res: Response, next: NextFunction): void;
