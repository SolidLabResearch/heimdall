import { WriteLockArray } from "./Util";

describe("WriteLockArray", () => {
    let write_lock_array: WriteLockArray<number>;

    beforeEach(() => {
        write_lock_array = new WriteLockArray<number>();
    });

    it("should_add_item_to_array", async () => {
        await write_lock_array.addItem(43);
        expect(write_lock_array.get_length()).toBe(1);
        expect(write_lock_array.get_item(0)).toBe(43);
        expect(write_lock_array.getArrayCopy()).toEqual([43]);
    });

    it('should_remove_item_from_array', async () => {
        await write_lock_array.addItem(43);
        await write_lock_array.removeItem(43);
        expect(write_lock_array.get_length()).toBe(0);
        expect(write_lock_array.getArrayCopy()).toEqual([]);
    });

    it('should_get_array_copy', async () => {
        await write_lock_array.addItem(43);
        await write_lock_array.addItem(44);
        await write_lock_array.addItem(45);
        const array_copy = write_lock_array.getArrayCopy();
        expect(array_copy).toEqual([43, 44, 45]);
        // making sure the array copy is not a reference to the original array
        array_copy.push(46);
        expect(write_lock_array.get_length()).toBe(3);
    });

    it('should_get_item', async () => {
        await write_lock_array.addItem(43);
        await write_lock_array.addItem(44);
        await write_lock_array.addItem(45);
        expect(write_lock_array.get_item(1)).toBe(44);
    });


    it('should_get_length', async () => {
        await write_lock_array.addItem(43);
        await write_lock_array.addItem(44);
        await write_lock_array.addItem(45);
        const length = write_lock_array.get_length();
        expect(length).toBe(3);
    });

    it('should_handle_concurrent_add_and_remove', async () => {
        const promise_one = write_lock_array.addItem(43);
        const promise_two = write_lock_array.removeItem(43);
        await Promise.all([promise_one, promise_two]);
        expect(write_lock_array.get_length()).toBe(0);
    });

    it('should_allow_simultaneous_read_and_write', async () => {
        const read_promise = new Promise<void>((resolve) => {
            let array_copy = write_lock_array.getArrayCopy();
            expect(array_copy).toEqual([]);
            write_lock_array.addItem(43).then(() => {
                array_copy = write_lock_array.getArrayCopy();
                expect(array_copy).toEqual(expect.arrayContaining([43]));
                resolve();
            });
        });

        const write_promise = write_lock_array.addItem(44);
        await Promise.all([read_promise, write_promise]);
    }); 
});
