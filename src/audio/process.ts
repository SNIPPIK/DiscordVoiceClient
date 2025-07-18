import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { spawn, spawnSync } from "node:child_process";

/**
 * @author SNIPPIK
 * @description Для уничтожения использовать <class>.emit("close")
 * @class Process
 * @public
 */
export class Process {
    /**
     * @description Процесс запущенный через spawn
     * @private
     */
    private _process: ChildProcessWithoutNullStreams;

    /**
     * @description Получаем ChildProcessWithoutNullStreams
     * @return ChildProcessWithoutNullStreams
     * @public
     */
    public get process() {
        return this._process!;
    };

    /**
     * @description Зарезервирован для вывода данных, как правило (хотя и не обязательно)
     * @return internal.Readable
     * @public
     */
    public get stdout() {
        return this?._process?.stdout ?? null;
    };

    /**
     * @description Задаем параметры и запускаем процесс
     * @param args {string[]} Аргументы для запуска
     * @param name {string} Имя процесса
     * @public
     */
    public constructor(args: string[], name: string = ffmpeg_path) {
        // Выдаем ошибку если нет FFmpeg
        if (!name) throw Error("[Critical] FFmpeg not found!");

        const index_resource = args.indexOf("-i");
        const index_seek = args.indexOf("-ss");

        // Проверяем на наличие ссылки в пути
        if (index_resource !== -1) {
            const isLink = args.at(index_resource + 1)?.startsWith("http");

            // Если указана ссылка
            if (isLink) args.unshift("-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5");
        }

        // Проверяем на наличие пропуска времени
        if (index_seek !== -1) {
            const seek = parseInt(args.at(index_seek + 1));

            // Если указано не число
            if (isNaN(seek) || seek === 0) args.splice(index_seek, 2);
        }

        args.unshift("-vn", "-loglevel", "panic");
        this._process = spawn(name, args);

        for (let event of ["end", "error", "exit"]) {
            this.process.once(event, this.destroy);
        }
    };

    /**
     * @description Удаляем и отключаемся от процесса
     * @private
     */
    public destroy = () => {
        if (this._process) {
            for (const std of [this._process.stdout, this._process.stderr, this._process.stdin]) {
                std.removeAllListeners();
                std.destroy();
            }

            this._process.ref();
            this._process.removeAllListeners();
            this._process.kill("SIGKILL");
            this._process = null;
        }
    };
}

/**
 * @author SNIPPIK
 * @description Путь до исполняемого файла ffmpeg
 * @private
 */
let ffmpeg_path = null;

/**
 * @author SNIPPIK
 * @description Делаем проверку на наличие FFmpeg
 */
(async () => {
    // Проверяем имена, если есть FFmpeg
    for (const name of ["ffmpeg"]) {
        try {
            const result = spawnSync(name, ['-h'], { windowsHide: true });
            if (result.error) continue;
            ffmpeg_path = name;
            return;
        } catch {}
    }
})();